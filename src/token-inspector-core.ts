/**
 * x402 Tools Hub — Token Inspector core.
 *
 * Fact-only token identity for Base mainnet. One question answered:
 *   "What is this token contract?"
 *
 *   input  { "address": "0x833589...", "chain": "base" }
 *   output address + chain + valid + is_contract + standard +
 *          name + symbol + decimals + total_supply + owner + source
 *
 * Rules:
 *   - Base only (anything else -> ok:false, notes["unsupported chain"])
 *   - Alchemy as the single, named source
 *   - no price, no holders, no risk score, no history, no advice
 *   - short timeout; on feed failure -> ok:false, never invent values
 *
 * Data path (Alchemy Base JSON-RPC, single batch):
 *   1. eth_getCode            -> is_contract (EOA vs contract)
 *   2. alchemy_getTokenMetadata -> name, symbol, decimals, logo
 *   3. eth_call totalSupply()  -> raw supply (best-effort)
 *   4. eth_call owner()        -> owner (best-effort, null if reverted)
 *
 * `standard` is an explicit heuristic from the metadata we actually got:
 *   name/symbol/decimals present  -> "ERC-20"
 *   no decimals but contract      -> "ERC-721"
 *   otherwise                     -> null
 *
 * Used by:
 *   - GET  /tools/token-inspector      (free page)
 *   - POST /api/token-inspector/lookup (free, for the page)
 *   - POST /api/token-inspector        (paid, for agents, $0.001)
 */

const TIMEOUT_MS = 8000;

/** Function selectors (keccak-256 first 4 bytes). */
const SEL_TOTAL_SUPPLY = "0x18160ddd"; // totalSupply()
const SEL_OWNER = "0x8da5cb5b";        // owner()

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export interface TokenInspectorInput {
  address: string;
  chain?: string;
}

export interface TokenInspectorResult {
  address: string;
  chain: string;
  valid: boolean;
  is_contract: boolean | null;
  standard: string | null;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  total_supply: string | null;
  owner: string | null;
  source: string;
  ok: boolean;
  notes: string[];
}

function isAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** Decode a uint256 return value from eth_call (32-byte hex -> decimal string). */
function decodeUint(hex: string | null): string | null {
  if (!hex || typeof hex !== "string") return null;
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length === 0) return null;
  try {
    return BigInt("0x" + h).toString(10);
  } catch {
    return null;
  }
}

/** Decode an address return value from eth_call (last 20 bytes of word). */
function decodeAddress(hex: string | null): string | null {
  if (!hex || typeof hex !== "string") return null;
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length < 40) return null;
  const addr = "0x" + h.slice(-40);
  if (!isAddress(addr)) return null;
  if (addr.toLowerCase() === ZERO_ADDR) return ZERO_ADDR; // renounced
  return addr;
}

interface RpcResult {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export async function getTokenInspector(
  input: TokenInspectorInput,
  alchemyBaseUrl: string | undefined,
): Promise<TokenInspectorResult> {
  const address = String(input.address || "").trim();
  const chain = String(input.chain || "base").trim().toLowerCase();
  const notes: string[] = [];

  const base: TokenInspectorResult = {
    address,
    chain,
    valid: false,
    is_contract: null,
    standard: null,
    name: null,
    symbol: null,
    decimals: null,
    total_supply: null,
    owner: null,
    source: "alchemy",
    ok: false,
    notes,
  };

  if (chain !== "base") {
    notes.push(`unsupported chain "${chain}" — only "base" is supported`);
    return base;
  }

  if (!isAddress(address)) {
    notes.push("invalid EVM address: expected 0x + 40 hex chars");
    return base;
  }

  base.valid = true;

  if (!alchemyBaseUrl) {
    notes.push("ALCHEMY_BASE_URL is not configured on the worker");
    return base;
  }

  // One batch: getCode + getTokenMetadata + totalSupply + owner.
  const payload = [
    { jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] },
    { jsonrpc: "2.0", id: 2, method: "alchemy_getTokenMetadata", params: [address] },
    { jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: address, data: SEL_TOTAL_SUPPLY }, "latest"] },
    { jsonrpc: "2.0", id: 4, method: "eth_call", params: [{ to: address, data: SEL_OWNER }, "latest"] },
  ];

  let rows: RpcResult[];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch(alchemyBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      notes.push(`Alchemy HTTP ${r.status}`);
      return base;
    }
    const j = (await r.json()) as RpcResult | RpcResult[];
    rows = Array.isArray(j) ? j : [j];
  } catch (e) {
    notes.push(`Alchemy request failed: ${String((e as Error).message || e)}`);
    return base;
  }

  const byId = new Map<number, RpcResult>();
  for (const row of rows) byId.set(row.id, row);

  // 1. is_contract
  const codeRow = byId.get(1);
  if (codeRow && typeof codeRow.result === "string") {
    base.is_contract = codeRow.result !== "0x" && codeRow.result !== "0x0" && codeRow.result.length > 2;
  }

  // 2. metadata
  const metaRow = byId.get(2);
  const meta = (metaRow && typeof metaRow.result === "object" && metaRow.result !== null)
    ? (metaRow.result as Record<string, unknown>)
    : null;
  if (meta) {
    if (typeof meta.name === "string" && meta.name) base.name = meta.name;
    if (typeof meta.symbol === "string" && meta.symbol) base.symbol = meta.symbol;
    if (typeof meta.decimals === "number") base.decimals = meta.decimals;
  } else if (metaRow && metaRow.error) {
    notes.push(`alchemy_getTokenMetadata: ${metaRow.error.message}`);
  }

  // 3. totalSupply (best-effort)
  const tsRow = byId.get(3);
  if (tsRow && typeof tsRow.result === "string") {
    base.total_supply = decodeUint(tsRow.result);
  } else if (tsRow && tsRow.error) {
    notes.push(`totalSupply(): ${tsRow.error.message}`);
  }

  // 4. owner (best-effort; reverted calls are normal)
  const owRow = byId.get(4);
  if (owRow && typeof owRow.result === "string") {
    base.owner = decodeAddress(owRow.result);
  }

  // 5. standard — explicit heuristic from what we actually got
  if (base.is_contract) {
    if ((base.name || base.symbol) && base.decimals !== null) {
      base.standard = "ERC-20";
    } else if (base.decimals === null) {
      base.standard = "ERC-721";
    }
  }

  base.ok = true;
  return base;
}
