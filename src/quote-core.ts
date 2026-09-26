/**
 * x402 Tools Hub — Token Quote core.
 *
 * A single-source, fact-only quote. No buy/sell, no verdict, no history.
 *
 *   input  { "id": "ETH" | "BTC" | "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "vs": "USD" }
 *   output price + change_24h + source + as_of
 *
 * Rules:
 *   - one source, named explicitly in `source`
 *   - short timeout; if the feed is dead → ok:false, never invent a price
 *   - Base USDC address resolves to $1 with a source note
 *
 * Source: Binance public market data (no key, no rate limit).
 *   primary   https://data-api.binance.vision/api/v3/ticker/24hr
 *   fallback  https://api.binance.com/api/v3/ticker/24hr
 *
 * Used by:
 *   - GET  /tools/token-quote          (free page)
 *   - POST /api/token-quote/lookup     (free, for the page)
 *   - POST /api/token-quote            (paid, for agents, $0.001)
 */

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TIMEOUT_MS = 6000;

// Well-known Base addresses -> Binance symbol (fallback for 0x inputs).
const BASE_ADDR_SYMBOL: Record<string, string> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC", // USDC on Base
  "0x4200000000000000000000000000000000000006": "ETH",  // WETH on Base
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": "BTC",  // cbBTC on Base
};

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

function isAddress(id: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(id);
}

async function binanceTicker(symbol: string): Promise<{ price: number; change24h: number | null } | null> {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com"];
  for (const host of hosts) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const r = await fetch(`${host}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0 (compatible; x402-tools-hub/1.0)",
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue; // try next host
      const j = (await r.json()) as { lastPrice?: string; priceChangePercent?: string };
      const price = parseFloat(j.lastPrice ?? "");
      if (!Number.isFinite(price) || price <= 0) continue;
      const change = parseFloat(j.priceChangePercent ?? "");
      return {
        price,
        change24h: Number.isFinite(change) ? change : null,
      };
    } catch {
      // try next host
    }
  }
  return null;
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

  // Resolve 0x input -> known Binance symbol, or fail honestly.
  let symbolId = id;
  let address: string | null = null;
  if (isAddress(id)) {
    const sym = BASE_ADDR_SYMBOL[id.toLowerCase()];
    if (!sym) {
      notes.push(`Binance does not quote contract addresses. For "${id}" use a symbol (e.g. ETH, BTC) or a known Base address.`);
      return { id, address, vs, price: 0, change_24h: null, source: "binance", as_of: now, ok: false, notes };
    }
    symbolId = sym;
    address = id;
    notes.push(`Known Base address resolved to ${sym}; quote via Binance ${sym}USDT.`);
  }

  const pair = `${symbolId.toUpperCase()}USDT`;

  // Single source: Binance public 24h ticker (free, no key, no rate limit).
  const tick = await binanceTicker(pair);
  if (!tick) {
    notes.push(`No Binance quote for "${symbolId}" (pair ${pair}). Try another symbol (e.g. BTC, ETH, SOL, USDC) or a Base address.`);
    return { id, address, vs, price: 0, change_24h: null, source: "binance", as_of: now, ok: false, notes };
  }

  const price = tick.price;
  const change_24h = tick.change24h;
  if (vs === "USDT") {
    notes.push("Binance quotes USDT pairs; 1 USDT ≈ $1.");
  } else if (vs !== "USD") {
    notes.push(`Only USD/USDT supported; showing USDT value as ${vs}.`);
  }

  return {
    id,
    address,
    vs,
    price,
    change_24h,
    source: "binance",
    as_of: now,
    ok: true,
    notes,
  };
}