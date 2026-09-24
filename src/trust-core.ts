/**
 * x402 Tools Hub — Trust Layer core.
 *
 * On-chain USDC (Base) receipts & agent reputation, read via Alchemy.
 *
 * There is NO database here. The chain itself is the source of truth:
 * data stays consistent across Worker isolates and survives every deploy,
 * without D1, KV or any persistent store.
 *
 * Used by:
 *   - GET  /tools/flight-recorder  (free page)
 *   - GET  /tools/agent-passport   (free page)
 *   - POST /api/flight-recorder/lookup  (free, for the page)
 *   - POST /api/agent-passport/lookup   (free, for the page)
 *   - POST /api/flight-recorder  (paid, for agents)
 *   - POST /api/agent-passport   (paid, for agents)
 */

/** Canonical USDC on Base mainnet. */
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const BASESCAN_TX = "https://basescan.org/tx/";
export const BASESCAN_ADDR = "https://basescan.org/address/";

/* ------------------------------------------------------------------ */
/*  Alchemy plumbing                                                   */
/* ------------------------------------------------------------------ */

interface RawTransfer {
  hash?: string;
  from?: string;
  to?: string;
  value?: number | string;
  asset?: string;
  blockNum?: string;
  metadata?: { blockTimestamp?: string };
}

async function alchemy<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`alchemy http ${r.status} for ${method}`);
  const j = (await r.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? `alchemy error in ${method}`);
  return j.result as T;
}

/**
 * Pull USDC (Base) transfers for a single address.
 * direction = "in"  → transfers where the address is the recipient
 * direction = "out" → transfers where the address is the sender
 */
/* Base ~2s blocks -> ~43_200 blocks/day. Default lookback window: 90 days. */
const BLOCKS_PER_DAY = 43_200;
const DEFAULT_LOOKBACK_BLOCKS = 90 * BLOCKS_PER_DAY;

/* Isolate-level caches (per Worker instance, no DB). */
let latestBlockCache: { block: number; at: number } | null = null;
const transferCache = new Map<string, { at: number; data: RawTransfer[] }>();
const LATEST_TTL_MS = 30_000;
const TRANSFER_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;

async function getLatestBlock(alchemyUrl: string): Promise<number> {
  if (latestBlockCache && Date.now() - latestBlockCache.at < LATEST_TTL_MS) {
    return latestBlockCache.block;
  }
  const hex = await alchemy<string>(alchemyUrl, "eth_blockNumber", []);
  const block = Number(BigInt(hex));
  latestBlockCache = { block, at: Date.now() };
  return block;
}

async function fetchUsdcTransfers(
  alchemyUrl: string,
  direction: "in" | "out",
  address: string,
  limit: number,
  lookbackBlocks: number = DEFAULT_LOOKBACK_BLOCKS,
): Promise<RawTransfer[]> {
  const key = `${direction}:${address.toLowerCase()}:${limit}:${lookbackBlocks}`;
  const hit = transferCache.get(key);
  if (hit && Date.now() - hit.at < TRANSFER_TTL_MS) return hit.data;

  const latest = await getLatestBlock(alchemyUrl);
  const fromBlockNum = Math.max(0, latest - lookbackBlocks);

  const filter: Record<string, unknown> = {
    fromBlock: "0x" + fromBlockNum.toString(16),
    toBlock: "latest",
    contractAddresses: [USDC_BASE],
    category: ["erc20"],
    maxCount: "0x" + Math.min(Math.max(limit, 1), 500).toString(16),
    order: "desc",
    withMetadata: true,
  };
  if (direction === "in") filter.toAddress = address;
  else filter.fromAddress = address;

  const res = await alchemy<{ transfers: RawTransfer[] }>(
    alchemyUrl,
    "alchemy_getAssetTransfers",
    [filter],
  );
  const data = res.transfers ?? [];

  if (transferCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = transferCache.keys().next().value;
    if (firstKey) transferCache.delete(firstKey);
  }
  transferCache.set(key, { at: Date.now(), data });
  return data;
}

function toReceipt(t: RawTransfer): Receipt {
  const value = typeof t.value === "number" ? t.value : Number(t.value ?? 0);
  const hash = String(t.hash ?? "");
  return {
    from: String(t.from ?? "").toLowerCase(),
    to: String(t.to ?? "").toLowerCase(),
    amount_usd: Number.isFinite(value) ? value : 0,
    asset: String(t.asset ?? "USDC"),
    tx_hash: hash,
    block: t.blockNum ? Number(BigInt(t.blockNum)) : null,
    at: t.metadata?.blockTimestamp ?? "",
    basescan: hash ? BASESCAN_TX + hash : "",
  };
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Receipt {
  from: string;
  to: string;
  amount_usd: number;
  asset: string;
  tx_hash: string;
  block: number | null;
  at: string;
  basescan: string;
}

export interface ReceiptsResult {
  address: string;
  direction: "in" | "out";
  count: number;
  total_usd: number;
  unique_counterparties: number;
  first_seen: string | null;
  last_seen: string | null;
  receipts: Receipt[];
}

export type TrustTier = "new" | "bronze" | "silver" | "gold" | "platinum";

export interface PassportFlag {
  code: string;
  message: string;
  weight: number;
}

export interface PassportStats {
  address: string;
  first_seen: string | null;
  last_seen: string | null;
  wallet_age_days: number | null;
  days_since_last_seen: number | null;
  total_paid_usd: number;
  tx_count: number;
  avg_payment_usd: number;
  merchants: string[];
  merchants_count: number;
  last_merchant: string | null;
  trust_score: number;
  tier: TrustTier;
  flags: PassportFlag[];
  recent_payments: Receipt[];
}

/* ------------------------------------------------------------------ */
/*  Flight Recorder — incoming receipts for any address                */
/* ------------------------------------------------------------------ */

export async function getReceipts(
  alchemyUrl: string,
  address: string,
  direction: "in" | "out" = "in",
  limit = 50,
): Promise<ReceiptsResult> {
  const raw = await fetchUsdcTransfers(alchemyUrl, direction, address, limit);
  const receipts = raw.map(toReceipt);

  // Alchemy returns newest-first. Keep that order for the list,
  // but compute first/last seen from the timestamps themselves.
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;
  let total = 0;
  const parties = new Set<string>();

  for (const r of receipts) {
    total += r.amount_usd;
    parties.add(direction === "in" ? r.from : r.to);
    if (r.at) {
      if (!firstSeen || r.at < firstSeen) firstSeen = r.at;
      if (!lastSeen || r.at > lastSeen) lastSeen = r.at;
    }
  }

  return {
    address,
    direction,
    count: receipts.length,
    total_usd: +total.toFixed(6),
    unique_counterparties: parties.size,
    first_seen: firstSeen,
    last_seen: lastSeen,
    receipts,
  };
}

/* ------------------------------------------------------------------ */
/*  Agent Passport — reputation for any payer wallet                   */
/* ------------------------------------------------------------------ */

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (isNaN(ta) || isNaN(tb)) return null;
  return Math.max(0, Math.floor(Math.abs(tb - ta) / 86_400_000));
}

function ageScore(days: number | null): { weight: number; flag: PassportFlag | null } {
  if (days === null) return { weight: 0, flag: null };
  if (days < 7) return { weight: 0, flag: { code: "very_young", message: `Wallet is ${days} days old`, weight: 0 } };
  if (days < 30) return { weight: 10, flag: null };
  if (days < 90) return { weight: 15, flag: null };
  if (days < 365) return { weight: 20, flag: null };
  return { weight: 25, flag: { code: "mature", message: `Wallet is over a year old`, weight: 0 } };
}

function volumeScore(total: number): { weight: number; flag: PassportFlag | null } {
  if (total < 1) return { weight: 0, flag: { code: "micro_volume", message: `Total paid under $1`, weight: 0 } };
  if (total < 10) return { weight: 5, flag: null };
  if (total < 100) return { weight: 15, flag: null };
  if (total < 1000) return { weight: 20, flag: null };
  return { weight: 25, flag: { code: "high_volume", message: `Total paid over $1000`, weight: 0 } };
}

function frequencyScore(txCount: number): { weight: number; flag: PassportFlag | null } {
  if (txCount < 3) return { weight: 0, flag: { code: "low_frequency", message: `Only ${txCount} payments`, weight: 0 } };
  if (txCount < 10) return { weight: 10, flag: null };
  if (txCount < 50) return { weight: 15, flag: null };
  return { weight: 20, flag: { code: "high_frequency", message: `${txCount} payments`, weight: 0 } };
}

function diversityScore(merchants: number): { weight: number; flag: PassportFlag | null } {
  if (merchants <= 0) return { weight: 0, flag: null };
  if (merchants === 1) return { weight: 5, flag: { code: "single_merchant", message: `Only 1 counterparty`, weight: 0 } };
  if (merchants < 5) return { weight: 10, flag: null };
  if (merchants < 10) return { weight: 15, flag: null };
  return { weight: 20, flag: { code: "diverse", message: `${merchants} counterparties`, weight: 0 } };
}

function recencyScore(days: number | null): { weight: number; flag: PassportFlag | null } {
  if (days === null) return { weight: 0, flag: null };
  if (days < 1) return { weight: 10, flag: null };
  if (days < 7) return { weight: 8, flag: null };
  if (days < 30) return { weight: 5, flag: null };
  if (days < 90) return { weight: 2, flag: null };
  return { weight: 0, flag: { code: "dormant", message: `Last seen over 90 days ago`, weight: 0 } };
}

function tierOf(score: number): TrustTier {
  if (score >= 80) return "platinum";
  if (score >= 60) return "gold";
  if (score >= 40) return "silver";
  if (score >= 20) return "bronze";
  return "new";
}

export async function getPassport(
  alchemyUrl: string,
  address: string,
  limit = 200,
): Promise<PassportStats> {
  const raw = await fetchUsdcTransfers(alchemyUrl, "out", address, limit);
  const payments = raw.map(toReceipt);

  let totalPaid = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;
  const merchants = new Set<string>();
  let lastMerchant: string | null = null;
  let lastAt = "";

  for (const p of payments) {
    totalPaid += p.amount_usd;
    if (p.to) merchants.add(p.to);
    if (p.at) {
      if (!firstSeen || p.at < firstSeen) firstSeen = p.at;
      if (!lastSeen || p.at > lastSeen) lastSeen = p.at;
      if (p.at > lastAt) {
        lastAt = p.at;
        lastMerchant = p.to || null;
      }
    }
  }

  const txCount = payments.length;
  const avg = txCount ? +(totalPaid / txCount).toFixed(6) : 0;
  const walletAge = daysBetween(firstSeen, new Date().toISOString());
  const sinceLast = lastSeen ? daysBetween(lastSeen, new Date().toISOString()) : null;

  const flags: PassportFlag[] = [];
  const push = (r: { flag: PassportFlag | null }) => { if (r.flag) flags.push(r.flag); };

  const a = ageScore(walletAge);
  const v = volumeScore(totalPaid);
  const f = frequencyScore(txCount);
  const d = diversityScore(merchants.size);
  const r = recencyScore(sinceLast);
  push(a); push(v); push(f); push(d); push(r);

  const score = Math.max(0, Math.min(100, a.weight + v.weight + f.weight + d.weight + r.weight));

  return {
    address,
    first_seen: firstSeen,
    last_seen: lastSeen,
    wallet_age_days: walletAge,
    days_since_last_seen: sinceLast,
    total_paid_usd: +totalPaid.toFixed(6),
    tx_count: txCount,
    avg_payment_usd: avg,
    merchants: Array.from(merchants),
    merchants_count: merchants.size,
    last_merchant: lastMerchant,
    trust_score: score,
    tier: tierOf(score),
    flags,
    recent_payments: payments.slice(0, 10),
  };
}
