/**
 * x402 Tools Hub — Agent Health core.
 *
 * Thin orchestrator over existing primitives — it does NOT reimplement
 * x402 parsing or discovery reading:
 *
 *   probeEndpoint()   → 402 / x402 / price / network / asset / payTo / challenge_valid
 *   readWellKnown()   → x402 / openapi / agent.json / llms / robots
 *   latency           → real measured time
 *
 * Verdict statuses are strictly TECHNICAL:
 *   PAYMENT_READY | CHALLENGE_INVALID | NOT_X402 | UNREACHABLE |
 *   PAYMENT_CONFIG_MISSING | DISCOVERY_MISSING | SLOW
 *
 * PAYMENT_READY only means "endpoint technically looks ready for an x402
 * call". It does NOT mean the service is safe, high-quality or trustworthy.
 *
 * Used by:
 *   - GET  /tools/agent-health        (free page, Cosmic Console)
 *   - POST /api/agent-health/lookup   (free, for the page)
 *   - POST /api/agent-health          (paid, for agents, $0.003)
 */

import { probeEndpoint, type ProbeInput, type ProbeResult } from "./probe-core";
import { readWellKnown, type WellKnownInput, type WellKnownResult } from "./wellknown-core";

export type HealthVerdict =
  | "PAYMENT_READY"
  | "CHALLENGE_INVALID"
  | "NOT_X402"
  | "UNREACHABLE"
  | "PAYMENT_CONFIG_MISSING"
  | "DISCOVERY_MISSING"
  | "SLOW";

export interface HealthInput {
  url: string;
  method?: string;
  body?: unknown;
  timeout_ms?: number;
}

export interface DiscoveryMatrix {
  x402: boolean;
  openapi: boolean;
  agent_json: boolean;
  llms: boolean;
  robots: boolean;
}

export interface HealthResult {
  url: string;
  verdict: HealthVerdict;
  payment: {
    x402: boolean;
    http_status: number | null;
    challenge_valid: boolean;
    network: string | null;
    asset: string | null;
    amount_usd: number | null;
    pay_to: string | null;
    method: string;
  } | null;
  discovery: DiscoveryMatrix | null;
  latency_ms: number | null;
  notes: string[];
}

const SLOW_MS = 2000;

export async function runAgentHealth(input: HealthInput): Promise<HealthResult> {
  const url = String(input.url || "").trim();
  const notes: string[] = [];

  // ---- latency (real, measured around the probe) ----
  const t0 = Date.now();
  let probe: ProbeResult | null = null;
  let probeErr: string | null = null;
  try {
    const probeInput: ProbeInput = {
      url,
      method: input.method,
      body: input.body,
      timeout_ms: input.timeout_ms,
      mode: "challenge",
    };
    probe = await probeEndpoint(probeInput);
  } catch (e) {
    probeErr = String((e as Error).message || e);
  }
  const latencyMs = Date.now() - t0;

  // ---- unreachable ----
  if (probeErr || probe?.http_status === null || probe?.http_status === 0) {
    notes.push(probeErr ? `probe error: ${probeErr}` : "endpoint unreachable or timed out");
    return {
      url,
      verdict: "UNREACHABLE",
      payment: null,
      discovery: null,
      latency_ms: latencyMs,
      notes,
    };
  }

  if (!probe) {
    return {
      url,
      verdict: "UNREACHABLE",
      payment: null,
      discovery: null,
      latency_ms: latencyMs,
      notes: ["probe returned no result"],
    };
  }

  // ---- not x402 ----
  if (!probe.x402 || probe.http_status !== 402) {
    notes.push(`HTTP ${probe.http_status} without 402 — not an x402 endpoint.`);
    return {
      url,
      verdict: "NOT_X402",
      payment: {
        x402: false,
        http_status: probe.http_status,
        challenge_valid: false,
        network: null,
        asset: null,
        amount_usd: null,
        pay_to: null,
        method: probe.method_tried,
      },
      discovery: null,
      latency_ms: latencyMs,
      notes,
    };
  }

  // ---- challenge validity ----
  if (!probe.parse.challenge_valid) {
    const errors = probe.parse.errors || [];
    notes.push(`Challenge invalid: ${errors.join(", ")}`);
    return {
      url,
      verdict: "CHALLENGE_INVALID",
      payment: {
        x402: true,
        http_status: 402,
        challenge_valid: false,
        network: probe.challenge?.network ?? null,
        asset: probe.challenge?.asset ?? null,
        amount_usd: probe.challenge?.amount_usd ?? null,
        pay_to: probe.challenge?.pay_to ?? null,
        method: probe.method_tried,
      },
      discovery: null,
      latency_ms: latencyMs,
      notes,
    };
  }

  // ---- challenge present but no payTo/amount ----
  const ch = probe.challenge;
  if (!ch?.pay_to || ch.amount_usd === null) {
    notes.push("402 returned but payment config missing payTo/amount.");
    return {
      url,
      verdict: "PAYMENT_CONFIG_MISSING",
      payment: {
        x402: true,
        http_status: 402,
        challenge_valid: true,
        network: ch?.network ?? null,
        asset: ch?.asset ?? null,
        amount_usd: ch?.amount_usd ?? null,
        pay_to: ch?.pay_to ?? null,
        method: probe.method_tried,
      },
      discovery: null,
      latency_ms: latencyMs,
      notes,
    };
  }

  // ---- discovery (separate block, does not affect PAYMENT_READY) ----
  let discovery: DiscoveryMatrix | null = null;
  try {
    const wkInput: WellKnownInput = { url };
    const wk: WellKnownResult = await readWellKnown(wkInput);
    discovery = {
      x402: wk.entries.find((e) => e.name === "/.well-known/x402")?.status === "found",
      openapi: wk.entries.find((e) => e.name === "/openapi.json")?.status === "found",
      agent_json:
        wk.entries.find((e) => e.name === "/.well-known/agent.json")?.status === "found" ||
        wk.entries.find((e) => e.name === "/agent.json")?.status === "found",
      llms: wk.entries.find((e) => e.name === "/llms.txt")?.status === "found",
      robots: wk.entries.find((e) => e.name === "/robots.txt")?.status === "found",
    };
    const foundCount = Object.values(discovery).filter(Boolean).length;
    notes.push(`Discovery: ${foundCount}/5 documents found.`);
  } catch (e) {
    notes.push(`Discovery read failed: ${String((e as Error).message || e)}`);
  }

  // ---- slow ----
  if (latencyMs > SLOW_MS) {
    notes.push(`Slow response: ${latencyMs}ms (threshold ${SLOW_MS}ms).`);
    return {
      url,
      verdict: "SLOW",
      payment: {
        x402: true,
        http_status: 402,
        challenge_valid: true,
        network: ch.network,
        asset: ch.asset,
        amount_usd: ch.amount_usd,
        pay_to: ch.pay_to,
        method: probe.method_tried,
      },
      discovery,
      latency_ms: latencyMs,
      notes,
    };
  }

  // ---- PAYMENT_READY ----
  notes.push("PAYMENT_READY: endpoint technically ready for an x402 call. Not a safety/quality claim.");
  return {
    url,
    verdict: "PAYMENT_READY",
    payment: {
      x402: true,
      http_status: 402,
      challenge_valid: true,
      network: ch.network,
      asset: ch.asset,
      amount_usd: ch.amount_usd,
      pay_to: ch.pay_to,
      method: probe.method_tried,
    },
    discovery,
    latency_ms: latencyMs,
    notes,
  };
}