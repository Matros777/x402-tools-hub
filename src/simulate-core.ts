/**
 * x402 Tools Hub — x402 Simulate core.
 *
 * Pure, stateless cost modelling for x402 payments. No network, no
 * chain, no database — just arithmetic an agent (or a human) can use to
 * decide whether a workload is worth running on x402 rails.
 *
 * Given a stream of planned calls it works out:
 *   - how much the calls cost in USDC;
 *   - how much the per-call x402 overhead adds;
 *   - the effective price per call including overhead;
 *   - a break-even point versus a flat subscription.
 *
 * Used by:
 *   - GET  /tools/x402-simulate          (free page)
 *   - POST /api/x402-simulate/lookup     (free, for the page)
 *   - POST /api/x402-simulate            (paid, for agents)
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SimulateCall {
  /** Human label for this call group, e.g. "wallet-intel". */
  name?: string;
  /** Price of a single call in USD. */
  price_usd: number;
  /** How many calls of this kind. */
  count: number;
}

export interface SimulateInput {
  calls: SimulateCall[];
  /**
   * Flat monthly subscription you are comparing against (USD).
   * When set, the simulator reports a break-even call count.
   */
  subscription_usd?: number;
  /**
   * Optional per-transaction network/gas overhead in USD. Defaults to a
   * small Base-mainnet estimate. This is informational — x402 on Base is
   * cheap, but not free.
   */
  network_fee_usd?: number;
}

export interface SimulateLine {
  name: string;
  price_usd: number;
  count: number;
  subtotal_usd: number;
}

export interface SimulateResult {
  lines: SimulateLine[];
  /** Sum of price * count across all lines. */
  api_cost_usd: number;
  total_calls: number;
  /** Network fee applied per call (echoed back for transparency). */
  network_fee_usd: number;
  network_cost_usd: number;
  /** api_cost_usd + network_cost_usd. */
  total_cost_usd: number;
  /** total_cost_usd / total_calls (0 when no calls). */
  effective_price_per_call_usd: number;
  /** api_cost_usd / total_calls (0 when no calls). */
  avg_api_price_usd: number;
  /** Overhead as a fraction of api_cost_usd (0..1). */
  overhead_ratio: number;
  subscription_usd: number | null;
  /** total_cost_usd - subscription_usd (null when no subscription). */
  savings_vs_subscription_usd: number | null;
  /** true when paying per call is cheaper than the subscription. */
  cheaper_than_subscription: boolean | null;
  /**
   * With a subscription present: how many calls at the average API
   * price fit inside the subscription before x402 becomes the more
   * expensive option. null when no subscription.
   */
  break_even_calls: number | null;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Default per-call network overhead estimate on Base (USD). */
export const DEFAULT_NETWORK_FEE_USD = 0.0001;

function round(n: number, digits = 6): number {
  const f = Math.pow(10, digits);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function sane(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Model the cost of an x402 workload. Pure function — safe to call for
 * any input, never throws on bad data (it sanitises instead).
 */
export function simulateX402(input: SimulateInput): SimulateResult {
  const notes: string[] = [];

  const rawCalls = Array.isArray(input.calls) ? input.calls : [];
  if (rawCalls.length === 0) notes.push("No calls supplied — cost is zero.");

  const lines: SimulateLine[] = rawCalls.map((c, i) => {
    const price = sane(c.price_usd, 0);
    const count = Math.floor(sane(c.count, 0));
    return {
      name: (c.name && String(c.name)) || `call-${i + 1}`,
      price_usd: round(price),
      count,
      subtotal_usd: round(price * count),
    };
  });

  const apiCost = lines.reduce((s, l) => s + l.subtotal_usd, 0);
  const totalCalls = lines.reduce((s, l) => s + l.count, 0);

  const netFee = input.network_fee_usd === undefined
    ? DEFAULT_NETWORK_FEE_USD
    : sane(input.network_fee_usd, 0);
  const netCost = round(netFee * totalCalls);
  const totalCost = round(apiCost + netCost);

  const avgApi = totalCalls ? apiCost / totalCalls : 0;
  const effPerCall = totalCalls ? totalCost / totalCalls : 0;
  const overhead = apiCost > 0 ? netCost / apiCost : 0;

  let subscription: number | null = null;
  let savings: number | null = null;
  let cheaper: boolean | null = null;
  let breakEven: number | null = null;

  if (input.subscription_usd !== undefined) {
    subscription = round(sane(input.subscription_usd, 0));
    savings = round(subscription - totalCost);
    cheaper = totalCost < subscription;
    // Ignore the fixed network fee when comparing per-call price with a
    // flat subscription: the break-even is about the API price itself.
    const perCallForBreakEven = netFee + avgApi;
    breakEven = perCallForBreakEven > 0
      ? Math.floor(subscription / perCallForBreakEven)
      : null;
    if (cheaper) notes.push("Pay-per-call is cheaper than the subscription for this volume.");
    else notes.push("The flat subscription wins at this volume.");
  } else {
    notes.push("No subscription supplied — reporting raw x402 cost only.");
  }

  if (netFee === 0) notes.push("Network fee treated as zero; real Base gas is small but non-zero.");

  return {
    lines,
    api_cost_usd: round(apiCost),
    total_calls: totalCalls,
    network_fee_usd: round(netFee),
    network_cost_usd: netCost,
    total_cost_usd: totalCost,
    effective_price_per_call_usd: round(effPerCall),
    avg_api_price_usd: round(avgApi),
    overhead_ratio: round(overhead, 6),
    subscription_usd: subscription,
    savings_vs_subscription_usd: savings,
    cheaper_than_subscription: cheaper,
    break_even_calls: breakEven,
    notes,
  };
}
