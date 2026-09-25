/**
 * x402 Tools Hub — Hub Stats core.
 *
 * On-chain, single source of truth. No D1, no KV, no Analytics Engine.
 * The chain is the database: every figure below is derived from USDC (Base)
 * transfers into the hub's payTo address, read via Alchemy.
 *
 * Honest by design: the known test wallet is reported separately, never
 * hidden, so the numbers can be trusted.
 *
 * Used by:
 *   - GET /api/stats   (free, public, machine-readable)
 *   - GET /status      (free page, self-probe + stats)
 *   - landing page widget (client-side fetch of /api/stats)
 */

import { TOOLS } from "./config";
import { getReceipts } from "./trust-core";
import { TELEMETRY_HEADER } from "./telemetry-core";

/** Known test wallet used by the team (awal CLI). Reported separately. */
export const TEST_WALLET = "0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103";

/* Isolate-level cache for stats — avoids hammering Alchemy on every hit. */
const STATS_TTL_MS = 3 * 60_000;
let statsCache: { at: number; data: HubStats } | null = null;

export interface HubStats {
  tools: number;
  network: string;
  source: string;
  payments_received: number;
  volume_usd: number;
  unique_payers: number;
  external_payments: number;
  external_volume_usd: number;
  external_payers: number;
  test_wallet: string;
  test_wallet_payments: number;
  test_wallet_volume_usd: number;
  first_payment_at: string | null;
  last_payment_at: string | null;
  last_external_payment_at: string | null;
  checked_at: string;
}

/**
 * Aggregate hub stats from on-chain receipts.
 * Uses a 200-receipt window with the trust-core isolate cache (5 min TTL).
 */
export async function getHubStats(
  alchemyUrl: string,
  payTo: string,
  network: string,
): Promise<HubStats> {
  if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) {
    return statsCache.data;
  }

  const receipts = await getReceipts(alchemyUrl, payTo, "in", 200);

  let externalPayments = 0;
  let externalVolume = 0;
  let testPayments = 0;
  let testVolume = 0;
  const externalPayers = new Set<string>();
  let lastExternalAt: string | null = null;

  for (const r of receipts.receipts) {
    const from = (r.from || "").toLowerCase();
    if (from === TEST_WALLET) {
      testPayments++;
      testVolume += r.amount_usd;
      continue;
    }
    externalPayments++;
    externalVolume += r.amount_usd;
    if (from) externalPayers.add(from);
    if (r.at && (!lastExternalAt || r.at > lastExternalAt)) lastExternalAt = r.at;
  }

  const data: HubStats = {
    tools: Object.keys(TOOLS).length,
    network,
    source: "on-chain USDC (Base) receipts via Alchemy",
    payments_received: receipts.count,
    volume_usd: +receipts.total_usd.toFixed(6),
    unique_payers: receipts.unique_counterparties,
    external_payments: externalPayments,
    external_volume_usd: +externalVolume.toFixed(6),
    external_payers: externalPayers.size,
    test_wallet: TEST_WALLET,
    test_wallet_payments: testPayments,
    test_wallet_volume_usd: +testVolume.toFixed(6),
    first_payment_at: receipts.first_seen,
    last_payment_at: receipts.last_seen,
    last_external_payment_at: lastExternalAt,
    checked_at: new Date().toISOString(),
  };

  statsCache = { at: Date.now(), data };
  return data;
}

/* ------------------------------------------------------------------ */
/*  Self-probe — liveness of the hub's own public surface              */
/* ------------------------------------------------------------------ */

export interface ProbeResult {
  url: string;
  path: string;
  status: number | null;
  ok: boolean;
  ms: number;
}

export interface SelfStatus {
  status: "ok" | "degraded" | "down";
  checked_at: string;
  probes: ProbeResult[];
  ok_count: number;
  total: number;
  avg_ms: number;
}

/** Probes that must always answer 200 for the hub to be considered healthy. */
const PROBE_PATHS = [
  "/health",
  "/api/list",
  "/openapi.json",
  "/llms.txt",
  "/.well-known/agent.json",
  "/.well-known/x402",
];

/**
 * Self-probe the hub's public surface.
 * fetch is I/O, not CPU — safe on Workers even with several parallel calls.
 */
export interface Prober {
  request(
    path: string,
    init?: RequestInit,
    env?: unknown,
  ): Response | Promise<Response>;
}

export async function selfProbe(
  app: Prober,
  env: unknown,
  origin: string,
): Promise<SelfStatus> {
  const started = Date.now();
  const results = await Promise.all(
    PROBE_PATHS.map(async (path): Promise<ProbeResult> => {
      const url = origin + path;
      const t0 = Date.now();
      try {
        const r = await app.request(
          path,
          { method: "GET", headers: { [TELEMETRY_HEADER]: "1" } },
          env,
        );
        // Drain body to avoid dangling streams.
        await r.text().catch(() => "");
        return { url, path, status: r.status, ok: r.status === 200, ms: Date.now() - t0 };
      } catch {
        return { url, path, status: null, ok: false, ms: Date.now() - t0 };
      }
    }),
  );

  const okCount = results.filter((r) => r.ok).length;
  const total = results.length;
  const avg = total ? Math.round(results.reduce((s, r) => s + r.ms, 0) / total) : 0;
  const status: SelfStatus["status"] =
    okCount === total ? "ok" : okCount === 0 ? "down" : "degraded";

  return {
    status,
    checked_at: new Date(started).toISOString(),
    probes: results,
    ok_count: okCount,
    total,
    avg_ms: avg,
  };
}
