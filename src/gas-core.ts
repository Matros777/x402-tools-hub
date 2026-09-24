/**
 * x402 Tools Hub — Base Gas Estimator core.
 *
 * Live gas price on Base via Alchemy (eth_gasPrice), plus a cost estimate
 * in ETH and USD for a given gas limit. Optional network-fee hint to feed
 * into the x402 simulator.
 *
 * No database. Falls back gracefully when Alchemy is not configured.
 *
 * Used by:
 *   - GET  /tools/base-gas            (free page)
 *   - POST /api/base-gas/lookup       (free, for the page)
 *   - POST /api/base-gas              (paid, for agents)
 */

const ETH_USD_FALLBACK = 2800; // static fallback, documented as estimate

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GasInfo {
  base_fee_gwei: number | null;
  priority_fee_gwei: number | null;
  total_gwei: number | null;
  gas_price_wei: number | null;
  /** Cost of a plain USDC transfer (default 21000 gas) in USD. */
  transfer_cost_usd: number | null;
  /** Cost for a typical contract call (default 90000 gas) in USD. */
  call_cost_usd: number | null;
  eth_usd: number | null;
  block_number: number | null;
  estimated_ms: number | null;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/*  Alchemy plumbing (JSON-RPC)                                        */
/* ------------------------------------------------------------------ */

async function rpc<T>(alchemyUrl: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(alchemyUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`alchemy http ${r.status} for ${method}`);
  const j = (await r.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? `alchemy error in ${method}`);
  return j.result as T;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function getBaseGas(
  alchemyUrl: string | undefined,
  ethUsd?: number | null,
): Promise<GasInfo> {
  const notes: string[] = [];
  let baseFee: number | null = null;
  let priorityFee: number | null = null;
  let blockNumber: number | null = null;
  let totalGwei: number | null = null;

  if (!alchemyUrl) {
    notes.push("ALCHEMY_BASE_URL not configured — returning static fallbacks only.");
  } else {
    try {
      const [priceHex, blockHex] = await Promise.all([
        rpc<string>(alchemyUrl, "eth_gasPrice", []),
        rpc<string>(alchemyUrl, "eth_blockNumber", []),
      ]);
      const priceWei = Number(BigInt(priceHex));
      const gwei = priceWei / 1e9;
      // On Base, eth_gasPrice returns a "safe low" style value; we treat it
      // as the total (base+priority) fee.
      baseFee = gwei;
      priorityFee = 0.02; // heuristic floor; documented
      blockNumber = Number(BigInt(blockHex));
      totalGwei = gwei;
    } catch (e) {
      notes.push(`Gas fetch failed: ${String((e as Error).message || e)}`);
    }
  }

  const usd = ethUsd && ethUsd > 0 ? ethUsd : ETH_USD_FALLBACK;

  const gweiToUsd = (gwei: number, gas: number): number => {
    const wei = gwei * 1e9;
    const eth = wei * gas;
    return (eth * usd) / 1e18;
  };

  const transferCost =
    totalGwei !== null ? gweiToUsd(totalGwei, 21000) : null;
  const callCost = totalGwei !== null ? gweiToUsd(totalGwei, 90000) : null;

  if (totalGwei === null) {
    notes.push("No live gas — cost estimates are null.");
  }

  return {
    base_fee_gwei: baseFee !== null ? +baseFee.toFixed(4) : null,
    priority_fee_gwei: priorityFee,
    total_gwei: totalGwei !== null ? +totalGwei.toFixed(4) : null,
    gas_price_wei: baseFee !== null ? Math.round(baseFee * 1e9) : null,
    transfer_cost_usd: transferCost !== null ? +transferCost.toFixed(6) : null,
    call_cost_usd: callCost !== null ? +callCost.toFixed(6) : null,
    eth_usd: usd,
    block_number: blockNumber,
    estimated_ms: null,
    notes,
  };
}