/**
 * x402 Tools Hub — Agent Studio core.
 *
 * Stateless "agent builder": turns a short description into a portable
 * agent.json manifest, checks which hub tools the agent can use, runs a
 * dry-run cost model via simulateX402, and (optionally) reads the trust
 * passport for the wallet the agent will pay from.
 *
 * No database, no private keys: the caller supplies a watch-only 0x
 * address if they want a trust check, and everything else is computed on
 * the fly.
 *
 * Used by:
 *   - GET  /tools/agent-studio         (free page)
 *   - POST /api/agent-studio/lookup    (free, for the page)
 *   - POST /api/agent-studio           (paid, for agents, $0.002)
 */

import { TOOLS, type AppConfig } from "./config";
import {
  simulateX402,
  type SimulateResult,
  type SimulateCall,
  type SimulateInput,
} from "./simulate-core";
import { getPassport } from "./trust-core";
import { isValidEvmAddress, normalizeAddress } from "./wallet-intel-core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentInput {
  name: string;
  goal?: string;
  tools: string[];
  calls_per_month?: number;
  subscription_usd?: number;
  wallet?: string;
  network?: string;
}

export interface AgentToolRef {
  name: string;
  path: string;
  priceUsd: number;
  free_for_humans: boolean;
  available: boolean;
  description: string;
}

export interface AgentManifest {
  schema: "x402-agent/1";
  name: string;
  goal: string;
  created_at: string;
  network: string;
  wallet: string | null;
  tools: AgentToolRef[];
  policy: {
    calls_per_month: number;
    monthly_budget_usd: number;
    subscription_usd: number | null;
    max_price_per_call_usd: number;
  };
  endpoints: {
    catalog: string;
    openapi: string;
    llms: string;
    well_known: string;
  };
  signature: string;
}

export interface CapabilityReport {
  tools: AgentToolRef[];
  missing: string[];
  total_monthly_cost_usd: number;
  cheapest_tool_price_usd: number;
  priciest_tool_price_usd: number;
  notes: string[];
}

export interface TrustSummary {
  score: number;
  tier: string;
  tx_count: number;
  total_paid_usd: number;
}

export interface DryRunReport {
  manifest: AgentManifest;
  capabilities: CapabilityReport;
  cost: SimulateResult;
  trust: TrustSummary | null;
  verdict: "ready" | "warnings" | "blocked";
  flags: string[];
  notes: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

function saneCount(n: unknown, fallback = 1000): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(Math.floor(v), 10_000_000);
}

function toolRef(name: string): AgentToolRef | null {
  const t = TOOLS[name];
  if (!t) return null;
  return {
    name,
    path: t.path,
    priceUsd: t.priceUsd,
    free_for_humans: t.freeForHumans,
    available: true,
    description: t.description,
  };
}

/* ------------------------------------------------------------------ */
/*  Manifest                                                           */
/* ------------------------------------------------------------------ */

export function buildAgentManifest(input: AgentInput, cfg: AppConfig): AgentManifest {
  const callsPerMonth = saneCount(input.calls_per_month, 1000);

  const seen = new Set<string>();
  const toolRefs: AgentToolRef[] = [];
  for (const name of input.tools ?? []) {
    if (seen.has(name)) continue;
    seen.add(name);
    const r = toolRef(name);
    if (r) toolRefs.push(r);
  }

  const maxPrice = toolRefs.reduce((m, t) => Math.max(m, t.priceUsd), 0);
  const monthlyBudget = round6(
    toolRefs.reduce((s, t) => s + t.priceUsd * callsPerMonth, 0),
  );

  const wallet =
    input.wallet && isValidEvmAddress(input.wallet)
      ? normalizeAddress(input.wallet)
      : null;

  return {
    schema: "x402-agent/1",
    name: (input.name || "untitled-agent").slice(0, 80),
    goal: (input.goal || "").slice(0, 400),
    created_at: new Date().toISOString(),
    network: input.network || cfg.network,
    wallet,
    tools: toolRefs,
    policy: {
      calls_per_month: callsPerMonth,
      monthly_budget_usd: monthlyBudget,
      subscription_usd:
        input.subscription_usd === undefined
          ? null
          : round6(Math.max(0, Number(input.subscription_usd) || 0)),
      max_price_per_call_usd: maxPrice,
    },
    endpoints: {
      catalog: `${cfg.siteUrl}/api/list`,
      openapi: `${cfg.siteUrl}/openapi.json`,
      llms: `${cfg.siteUrl}/llms.txt`,
      well_known: `${cfg.siteUrl}/.well-known/agent.json`,
    },
    signature: "",
  };
}

/* ------------------------------------------------------------------ */
/*  Capability check                                                   */
/* ------------------------------------------------------------------ */

export function capabilityCheck(input: AgentInput): CapabilityReport {
  const notes: string[] = [];
  const refs: AgentToolRef[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const name of input.tools ?? []) {
    if (seen.has(name)) continue;
    seen.add(name);
    const r = toolRef(name);
    if (r) refs.push(r);
    else missing.push(String(name));
  }

  const callsPerMonth = saneCount(input.calls_per_month, 1000);
  const totalPerCall = refs.reduce((s, r) => s + r.priceUsd, 0);
  const cheapest = refs.length
    ? refs.reduce((m, r) => Math.min(m, r.priceUsd), Infinity)
    : 0;
  const priciest = refs.reduce((m, r) => Math.max(m, r.priceUsd), 0);

  if (refs.length === 0) {
    notes.push("No known tools selected — pick at least one from the hub catalog.");
  }
  if (missing.length > 0) {
    notes.push(`${missing.length} unknown tool name(s) were ignored.`);
  }
  if (refs.some((r) => !r.free_for_humans)) {
    notes.push("Some selected tools are paid-only even in the browser UI.");
  }

  return {
    tools: refs,
    missing,
    total_monthly_cost_usd: round6(totalPerCall * callsPerMonth),
    cheapest_tool_price_usd: Number.isFinite(cheapest) ? cheapest : 0,
    priciest_tool_price_usd: priciest,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/*  Signature (sha256 short form, best effort)                         */
/* ------------------------------------------------------------------ */

async function signManifest(manifest: AgentManifest): Promise<AgentManifest> {
  const canonical = JSON.stringify({
    schema: manifest.schema,
    name: manifest.name,
    goal: manifest.goal,
    network: manifest.network,
    wallet: manifest.wallet,
    tools: manifest.tools.map((t) => t.name),
    policy: manifest.policy,
  });

  try {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return { ...manifest, signature: "unsigned" };
    }
    const bytes = new TextEncoder().encode(canonical);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const arr = Array.from(new Uint8Array(digest));
    const hex = arr
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
    return { ...manifest, signature: `sha256:${hex}` };
  } catch {
    return { ...manifest, signature: "unsigned" };
  }
}

/* ------------------------------------------------------------------ */
/*  Dry-run                                                            */
/* ------------------------------------------------------------------ */

export async function dryRunAgent(
  input: AgentInput,
  cfg: AppConfig,
): Promise<DryRunReport> {
  const manifest = await signManifest(buildAgentManifest(input, cfg));
  const capabilities = capabilityCheck(input);
  const callsPerMonth = manifest.policy.calls_per_month;

  const calls: SimulateCall[] = capabilities.tools.map((t) => ({
    name: t.name,
    price_usd: t.priceUsd,
    count: callsPerMonth,
  }));

  const costInput: SimulateInput = { calls };
  if (input.subscription_usd !== undefined) {
    costInput.subscription_usd = Math.max(0, Number(input.subscription_usd) || 0);
  }
  const cost = simulateX402(costInput);

  const flags: string[] = [];
  const notes: string[] = [];
  let trust: TrustSummary | null = null;

  if (manifest.wallet && cfg.alchemyBaseUrl) {
    try {
      const passport = await getPassport(cfg.alchemyBaseUrl, manifest.wallet);
      trust = {
        score: passport.trust_score,
        tier: passport.tier,
        tx_count: passport.tx_count,
        total_paid_usd: passport.total_paid_usd,
      };
      if (passport.trust_score < 40) {
        flags.push(
          `Low trust score (${passport.trust_score}/100) — start with small budgets and grow as history builds.`,
        );
      }
    } catch {
      notes.push("Trust check failed; continuing without passport data.");
    }
  } else if (input.wallet) {
    notes.push("Wallet address was invalid — trust check skipped.");
  }

  if (capabilities.tools.length === 0) {
    flags.push("No tools selected — this agent has nothing to call yet.");
  }
  if (input.subscription_usd !== undefined && cost.cheaper_than_subscription === false) {
    flags.push("A flat subscription looks cheaper at this volume — review before shipping.");
  }
  if (cost.overhead_ratio > 0.5) {
    flags.push(
      `Network overhead is ${(cost.overhead_ratio * 100).toFixed(0)}% of API cost — batch calls if possible.`,
    );
  }
  for (const n of capabilities.notes) notes.push(n);

  let verdict: DryRunReport["verdict"] = "ready";
  if (capabilities.tools.length === 0) verdict = "blocked";
  else if (flags.length > 0) verdict = "warnings";

  return { manifest, capabilities, cost, trust, verdict, flags, notes };
}
