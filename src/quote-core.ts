/**
 * x402 Tools Hub — Token Quote core.
 *
 * A single-source, fact-only quote. No buy/sell, no verdict, no history.
 *
 *   input  { "id": "ETH" | "BTC" | "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "vs": "USD" }
 *   output price + change_24h + source + as_of
 *
 * Rules:
 *   - one named source per successful answer, `source` is the winner
 *   - short timeout; if all feeds are dead → ok:false, never invent a price
 *   - Base USDC address resolves to $1 with a source note
 *
 * Sources (all public, no key, no rate limit):
 *   - Binance  https://data-api.binance.vision | https://api.binance.com
 *   - Bybit    https://api.bybit.com
 *   - OKX      https://www.okx.com
 *   - Kraken   https://api.kraken.com
 *   - Coinbase https://api.exchange.coinbase.com | https://api.coinbase.com
 *
 * The first source that returns a valid price wins. Binance data-centre
 * blocks (403/451 from Cloudflare) are handled by the fallback chain.
 *
 * Used by:
 *   - GET  /tools/token-quote          (free page)
 *   - POST /api/token-quote/lookup     (free, for the page)
 *   - POST /api/token-quote            (paid, for agents, $0.001)
 */

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TIMEOUT_MS = 5000;

// Well-known Base addresses -> symbol (fallback for 0x inputs).
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

// Kraken uses XBT for BTC; the rest use the plain symbol.
function krakenSym(sym: string): string {
  return sym.toUpperCase() === "BTC" ? "XBT" : sym.toUpperCase();
}

interface SourceSpec {
  name: string;
  url: string;
  parse: (j: any) => { price: number; change24h: number | null } | null;
}

function sourcesFor(sym: string): SourceSpec[] {
  const S = sym.toUpperCase();
  return [
    {
      name: "binance",
      url: `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${S}USDT`,
      parse: (j) => {
        const price = parseFloat(j?.lastPrice ?? "");
        if (!Number.isFinite(price) || price <= 0) return null;
        const ch = parseFloat(j?.priceChangePercent ?? "");
        return { price, change24h: Number.isFinite(ch) ? ch : null };
      },
    },
    {
      name: "binance",
      url: `https://api.binance.com/api/v3/ticker/24hr?symbol=${S}USDT`,
      parse: (j) => {
        const price = parseFloat(j?.lastPrice ?? "");
        if (!Number.isFinite(price) || price <= 0) return null;
        const ch = parseFloat(j?.priceChangePercent ?? "");
        return { price, change24h: Number.isFinite(ch) ? ch : null };
      },
    },
    {
      name: "bybit",
      url: `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${S}USDT`,
      parse: (j) => {
        const row = j?.result?.list?.[0];
        const price = parseFloat(row?.lastPrice ?? "");
        if (!Number.isFinite(price) || price <= 0) return null;
        const ch = parseFloat(row?.price24hPcnt ?? "");
        return { price, change24h: Number.isFinite(ch) ? ch * 100 : null };
      },
    },
    {
      name: "okx",
      url: `https://www.okx.com/api/v5/market/ticker?instId=${S}-USDT`,
      parse: (j) => {
        const row = j?.data?.[0];
        const price = parseFloat(row?.last ?? "");
        if (!Number.isFinite(price) || price <= 0) return null;
        const open = parseFloat(row?.open24h ?? "");
        let change: number | null = null;
        if (Number.isFinite(open) && open > 0) change = ((price - open) / open) * 100;
        return { price, change24h: change };
      },
    },
    {
      name: "kraken",
      url: `https://api.kraken.com/0/public/Ticker?pair=${krakenSym(S)}USD`,
      parse: (j) => {
        const row = j?.result?.[`${krakenSym(S)}USD`];
        const price = parseFloat(row?.c?.[0] ?? "");
        if (!Number.isFinite(price) || price <= 0) return null;
        const open = parseFloat(row?.o ?? "");
        let change: number | null = null;
        if (Number.isFinite(open) && open > 0) change = ((price - open) / open) * 100;
        return { price, change24h: change };
      },
    },
    {
      name: "coinbase",
      url: `https://api.exchange.coinbase.com/products/${S}-USD/stats`,
      parse: (j) => {
        const price = parseFloat(j?.last ?? "");
        if (!Number.isFinite(price) || price <= 0) return null;
        const open = parseFloat(j?.open ?? "");
        let change: number | null = null;
        if (Number.isFinite(open) && open > 0) change = ((price - open) / open) * 100;
        return { price, change24h: change };
      },
    },
    {
      name: "coinbase",
      url: `https://api.coinbase.com/v2/prices/${S}-USD/spot`,
      parse: (j) => {
        const price = parseFloat(j?.data?.amount ?? "");
        if (!Number.isFinite(price) || price <= 0) return null;
        return { price, change24h: null };
      },
    },
  ];
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; x402-tools-hub/1.0)",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

  // Resolve 0x input -> known symbol, or fail honestly.
  let symbolId = id;
  let address: string | null = null;
  if (isAddress(id)) {
    const sym = BASE_ADDR_SYMBOL[id.toLowerCase()];
    if (!sym) {
      notes.push(`Public exchanges do not quote contract addresses. For "${id}" use a symbol (e.g. ETH, BTC) or a known Base address.`);
      return { id, address, vs, price: 0, change_24h: null, source: "", as_of: now, ok: false, notes };
    }
    symbolId = sym;
    address = id;
    notes.push(`Known Base address resolved to ${sym}; quote from exchange feeds.`);
  }

  // Try sources in order; first valid price wins.
  for (const src of sourcesFor(symbolId)) {
    const j = await fetchJson(src.url);
    if (!j) {
      notes.push(`${src.name}: no response`);
      continue;
    }
    const parsed = src.parse(j);
    if (!parsed) {
      notes.push(`${src.name}: empty/unknown for "${symbolId}"`);
      continue;
    }
    if (vs === "USDT") notes.push("Exchange quotes USDT pairs; 1 USDT ≈ $1.");
    else if (vs !== "USD") notes.push(`Only USD/USDT supported; showing USD value as ${vs}.`);
    return {
      id,
      address,
      vs,
      price: parsed.price,
      change_24h: parsed.change24h,
      source: src.name,
      as_of: now,
      ok: true,
      notes,
    };
  }

  notes.push(`All feeds failed for "${symbolId}". Try another symbol (e.g. BTC, ETH, SOL, USDC) or a Base address.`);
  return { id, address, vs, price: 0, change_24h: null, source: "exchange", as_of: now, ok: false, notes };
}