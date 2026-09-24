/**
 * x402 Tools Hub — Token Quote core.
 *
 * A single-source, fact-only quote. No buy/sell, no verdict, no history.
 *
 *   input  { "id": "ETH" | "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "vs": "USD" }
 *   output price + change_24h + source + as_of
 *
 * Rules:
 *   - one source, named explicitly in `source`
 *   - short timeout; if the feed is dead → ok:false, never invent a price
 *   - Base USDC address resolves to $1 with a source note
 *
 * Used by:
 *   - GET  /tools/token-quote          (free page)
 *   - POST /api/token-quote/lookup     (free, for the page)
 *   - POST /api/token-quote            (paid, for agents, $0.001)
 */

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TIMEOUT_MS = 6000;

export interface QuoteInput {
  id: string;
  vs?: string;
}

export interface QuoteResult {
  id: string;
  address: string | null;
  vs: string;
  price: number;
  change_24h: number | null;
  source: string;
  as_of: string;
  ok: boolean;
  notes: string[];
}

export async function getTokenQuote(input: QuoteInput): Promise<QuoteResult> {
  const id = String(input.id || "").trim();
  const vs = (input.vs || "USD").toUpperCase();
  const notes: string[] = [];
  const now = new Date().toISOString();

  if (!id) {
    return { id: "", address: null, vs, price: 0, change_24h: null, source: "", as_of: now, ok: false, notes: ["id required"] };
  }

  // Base USDC address → $1 (peg), explicit source note.
  if (/^0x833589fcd6edb6e08f4c7c32d4f71b54bda02913$/i.test(id)) {
    return {
      id,
      address: USDC_BASE,
      vs,
      price: 1,
      change_24h: 0,
      source: "usdc-peg",
      as_of: now,
      ok: true,
      notes: ["USDC on Base is a stablecoin pegged to $1; quote from known peg."],
    };
  }

  // Single source: CoinGecko simple price (free, no key). Covers symbols
  // and most addresses.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id.toLowerCase())}&vs_currencies=usd&include_24hr_change=true`;
    const r = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; x402-tools-hub/1.0)",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      notes.push(`CoinGecko HTTP ${r.status}`);
      return { id, address: null, vs, price: 0, change_24h: null, source: "coingecko", as_of: now, ok: false, notes };
    }
    const j = (await r.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const row = j[id.toLowerCase()];
    if (!row || typeof row.usd !== "number") {
      notes.push(`No quote for "${id}" — try a contract address or a CoinGecko id (e.g. bitcoin, ethereum, usd-coin).`);
      return { id, address: null, vs, price: 0, change_24h: null, source: "coingecko", as_of: now, ok: false, notes };
    }
    return {
      id,
      address: null,
      vs,
      price: row.usd,
      change_24h: typeof row.usd_24h_change === "number" ? row.usd_24h_change : null,
      source: "coingecko",
      as_of: now,
      ok: true,
      notes: [],
    };
  } catch (e) {
    notes.push(`Feed failed: ${String((e as Error).message || e)}`);
    return { id, address: null, vs, price: 0, change_24h: null, source: "coingecko", as_of: now, ok: false, notes };
  }
}