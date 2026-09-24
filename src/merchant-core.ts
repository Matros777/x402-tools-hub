/**
 * x402 Tools Hub — Merchant Trust core.
 *
 * The mirror image of the Agent Passport: instead of scoring a *payer*,
 * this scores a *merchant* (a receiving wallet) from the USDC payments it
 * has received on Base. Same on-chain philosophy as trust-core.ts:
 *
 *   - no database, no cache, the chain is the source of truth;
 *   - reads USDC (Base) transfers through Alchemy;
 *   - deterministic scoring so the same merchant always gets the same score.
 *
 * Used by:
 *   - GET  /tools/merchant-trust              (free page)
 *   - POST /api/merchant-trust/lookup         (free, for the page)
 *   - POST /api/merchant-trust                (paid, for agents)
 */

import { getReceipts, type Receipt, type TrustTier } from "./trust-core";

export const BASESCAN_ADDR = "https://basescan.org/address/";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MerchantFlag {
  code: string;
  message: string;
}

export interface MerchantPayer {
  address: string;
  total_usd: number;
  tx_count: number;
  last_seen: string | null;
}

export interface MerchantStats {
  address: string;
  /** Overall 0-100 reputation score for this merchant. */
  merchant_score: number;
  tier: TrustTier;
  first_seen: string | null;
  last_seen: string | null;
  days_since_last_seen: number | null;
  /** Total USDC received, in USD. */
  total_received_usd: number;
  tx_count: number;
  avg_payment_usd: number;
  /** Largest single payment received. */
  max_payment_usd: number;
  /** Number of distinct paying wallets. */
  payers_count: number;
  /** Top payers by total volume (up to 10). */
  top_payers: MerchantPayer[];
  /** Share of the single largest payer in total volume (0..1). */
  top_payer_share: number;
  flags: MerchantFlag[];
  recent_receipts: Receipt[];
  basescan: string;
}

/* ------------------------------------------------------------------ */
/*  Scoring helpers                                                    */
/* ------------------------------------------------------------------ */

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (isNaN(ta) || isNaN(tb)) return null;
  return Math.max(0, Math.floor(Math.abs(tb - ta) / 86_400_000));
}

interface Scored {
  weight: number;
  flag: MerchantFlag | null;
}

/** How much USDC the merchant has received in total. */
function volumeScore(total: number): Scored {
  if (total <= 0) return { weight: 0, flag: { code: "no_volume", message: "No USDC payments received yet" } };
  if (total < 1) return { weight: 5, flag: { code: "micro_volume", message: "Total received under $1" } };
  if (total < 50) return { weight: 12, flag: null };
  if (total < 500) return { weight: 20, flag: null };
  if (total < 5000) return { weight: 25, flag: { code: "high_volume", message: "Total received over $500" } };
  return { weight: 30, flag: { code: "very_high_volume", message: "Total received over $5000" } };
}

/** How many distinct wallets have paid this merchant. */
function payerScore(payers: number): Scored {
  if (payers <= 0) return { weight: 0, flag: null };
  if (payers === 1) return { weight: 4, flag: { code: "single_payer", message: "Only 1 paying wallet" } };
  if (payers < 5) return { weight: 10, flag: null };
  if (payers < 20) return { weight: 16, flag: null };
  if (payers < 100) return { weight: 20, flag: null };
  return { weight: 25, flag: { code: "many_payers", message: `${payers} distinct paying wallets` } };
}

/** How often the merchant gets paid. */
function frequencyScore(txCount: number): Scored {
  if (txCount <= 0) return { weight: 0, flag: null };
  if (txCount < 3) return { weight: 4, flag: { code: "low_frequency", message: `Only ${txCount} payments received` } };
  if (txCount < 10) return { weight: 10, flag: null };
  if (txCount < 50) return { weight: 14, flag: null };
  return { weight: 18, flag: { code: "high_frequency", message: `${txCount} payments received` } };
}

/** How long the merchant has been receiving payments. */
function ageScore(days: number | null): Scored {
  if (days === null) return { weight: 0, flag: null };
  if (days < 7) return { weight: 0, flag: { code: "very_new", message: `First payment ${days} days ago` } };
  if (days < 30) return { weight: 8, flag: null };
  if (days < 90) return { weight: 12, flag: null };
  if (days < 365) return { weight: 16, flag: null };
  return { weight: 20, flag: { code: "established", message: "Receiving payments for over a year" } };
}

/** How recently the merchant got paid. */
function recencyScore(days: number | null): Scored {
  if (days === null) return { weight: 0, flag: null };
  if (days < 1) return { weight: 8, flag: null };
  if (days < 7) return { weight: 6, flag: null };
  if (days < 30) return { weight: 4, flag: null };
  if (days < 90) return { weight: 2, flag: null };
  return { weight: 0, flag: { code: "dormant", message: "No payments in the last 90 days" } };
}

/**
 * Concentration risk: a merchant whose whole volume comes from one payer
 * is fragile (and a possible wash-trading pattern).
 */
function concentrationScore(topShare: number, payers: number): Scored {
  if (payers <= 1) return { weight: 0, flag: { code: "single_payer_risk", message: "All volume comes from a single wallet" } };
  if (topShare >= 0.9) return { weight: 2, flag: { code: "high_concentration", message: "One payer accounts for over 90% of volume" } };
  if (topShare >= 0.7) return { weight: 4, flag: null };
  if (topShare >= 0.5) return { weight: 6, flag: null };
  return { weight: 7, flag: { code: "well_distributed", message: "Volume is well distributed across payers" } };
}

function tierOf(score: number): TrustTier {
  if (score >= 80) return "platinum";
  if (score >= 60) return "gold";
  if (score >= 40) return "silver";
  if (score >= 20) return "bronze";
  return "new";
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a reputation profile for a merchant (receiving wallet) from the
 * USDC payments it got on Base.
 */
export async function getMerchantTrust(
  alchemyUrl: string,
  address: string,
  limit = 200,
): Promise<MerchantStats> {
  // Incoming payments = receipts where this address is the recipient.
  const result = await getReceipts(alchemyUrl, address, "in", limit);
  const receipts = result.receipts;

  let total = 0;
  let maxPayment = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;
  const byPayer = new Map<string, MerchantPayer>();

  for (const r of receipts) {
    total += r.amount_usd;
    if (r.amount_usd > maxPayment) maxPayment = r.amount_usd;

    if (r.at) {
      if (!firstSeen || r.at < firstSeen) firstSeen = r.at;
      if (!lastSeen || r.at > lastSeen) lastSeen = r.at;
    }

    const payer = r.from || "unknown";
    const entry = byPayer.get(payer);
    if (entry) {
      entry.total_usd += r.amount_usd;
      entry.tx_count += 1;
      if (r.at && (!entry.last_seen || r.at > entry.last_seen)) entry.last_seen = r.at;
    } else {
      byPayer.set(payer, {
        address: payer,
        total_usd: r.amount_usd,
        tx_count: 1,
        last_seen: r.at || null,
      });
    }
  }

  const payers = Array.from(byPayer.values()).sort((a, b) => b.total_usd - a.total_usd);
  const topPayers = payers.slice(0, 10);
  const topShare = total > 0 && payers.length > 0 ? (payers[0]?.total_usd ?? 0) / total : 0;

  const txCount = receipts.length;
  const avg = txCount ? +(total / txCount).toFixed(6) : 0;
  const ageDays = daysBetween(firstSeen, new Date().toISOString());
  const sinceLast = lastSeen ? daysBetween(lastSeen, new Date().toISOString()) : null;

  const flags: MerchantFlag[] = [];
  const collect = (s: Scored) => { if (s.flag) flags.push(s.flag); };

  const v = volumeScore(total);
  const p = payerScore(payers.length);
  const f = frequencyScore(txCount);
  const a = ageScore(ageDays);
  const rec = recencyScore(sinceLast);
  const c = concentrationScore(topShare, payers.length);
  collect(v); collect(p); collect(f); collect(a); collect(rec); collect(c);

  const raw = v.weight + p.weight + f.weight + a.weight + rec.weight + c.weight;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    address,
    merchant_score: score,
    tier: tierOf(score),
    first_seen: firstSeen,
    last_seen: lastSeen,
    days_since_last_seen: sinceLast,
    total_received_usd: +total.toFixed(6),
    tx_count: txCount,
    avg_payment_usd: avg,
    max_payment_usd: +maxPayment.toFixed(6),
    payers_count: payers.length,
    top_payers: topPayers,
    top_payer_share: +topShare.toFixed(4),
    flags,
    recent_receipts: receipts.slice(0, 10),
    basescan: BASESCAN_ADDR + address,
  };
}
