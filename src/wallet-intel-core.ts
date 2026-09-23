/**
 * Wallet Intel — on-chain analytics for Base (EVM) via Alchemy.
 *
 * Transport-agnostic core: takes an Alchemy Base URL + a validated
 * lowercase address and returns plain data. Hono handlers live in
 * src/index.ts and stay tiny.
 *
 *   basic  : ETH balance, outgoing tx count, top ERC-20 tokens
 *   intel  : the above + transfer history, funding sources, risk score
 *
 * The browser page hits /api/wallet-lookup, which is intentionally
 * absent from the x402 TOOLS table and therefore free for humans.
 */

export const WALLET_CACHE_TTL_SECONDS = 600; // 10 min, per plan
const TOP_TOKENS = 5;
const TRANSFERS_SAMPLE = 10;

/* ------------------------------------------------------------------ */
/*  Validation + helpers                                              */
/* ------------------------------------------------------------------ */

export function isValidEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
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

function weiHexToEthString(weiHex: string): string {
  const wei = BigInt(weiHex || "0x0");
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = wei % base;
  return `${whole}.${frac.toString().padStart(18, "0").slice(0, 6)}`;
}

function rawToDecimal(rawHex: string, decimals: number): string {
  const raw = BigInt(rawHex || "0x0");
  if (decimals <= 0) return raw.toString();
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface WalletToken {
  contract: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  balance_raw: string;
  balance: string;
}

export interface WalletSnapshot {
  address: string;
  network: "base";
  eth_balance: string;
  eth_balance_wei: string;
  tx_count: number;
  tokens: WalletToken[];
  token_count: number;
  basescan: string;
}

export interface WalletTransfer {
  from: string;
  value: number;
  asset: string;
  at: string;
  hash: string;
}

export interface WalletRiskFlag {
  code: string;
  weight: number;
  message: string;
}

export interface WalletIntel extends WalletSnapshot {
  history: {
    first_tx_at: string | null;
    last_tx_at: string | null;
    wallet_age_days: number | null;
    transfers_sampled: number;
  };
  funding_sources: WalletTransfer[];
  recent_transfers: WalletTransfer[];
  risk: {
    score: number;
    level: "low" | "medium" | "high";
    flags: WalletRiskFlag[];
  };
}

/* ------------------------------------------------------------------ */
/*  Token portfolio                                                   */
/* ------------------------------------------------------------------ */

async function fetchTokens(
  url: string,
  address: string,
): Promise<{ tokens: WalletToken[]; total: number }> {
  const res = await alchemy<{
    tokenBalances: Array<{ contractAddress: string; tokenBalance: string }>;
  }>(url, "alchemy_getTokenBalances", [address, "erc20"]);

  const all = (res.tokenBalances ?? []).filter(
    (t) => t.tokenBalance && t.tokenBalance !== "0x0" && t.tokenBalance !== "0x",
  );
  // Rough "significance" proxy: highest raw balance first.
  all.sort((a, b) => (BigInt(a.tokenBalance) > BigInt(b.tokenBalance) ? -1 : 1));

  const top = all.slice(0, TOP_TOKENS);
  const metas = await Promise.all(
    top.map(async (t) => {
      try {
        const m = await alchemy<{ symbol: string | null; name: string | null; decimals: number } | null>(
          url,
          "alchemy_getTokenMetadata",
          [t.contractAddress],
        );
        return m ?? { symbol: null, name: null, decimals: 18 };
      } catch {
        return { symbol: null, name: null, decimals: 18 };
      }
    }),
  );

  const tokens: WalletToken[] = top.map((t, i) => {
    const m = metas[i] ?? { symbol: null, name: null, decimals: 18 };
    const decimals = typeof m.decimals === "number" ? m.decimals : 18;
    return {
      contract: t.contractAddress,
      symbol: m.symbol,
      name: m.name,
      decimals,
      balance_raw: t.tokenBalance,
      balance: rawToDecimal(t.tokenBalance, decimals),
    };
  });

  return { tokens, total: all.length };
}

/* ------------------------------------------------------------------ */
/*  Snapshot (basic tier)                                             */
/* ------------------------------------------------------------------ */

export async function getWalletSnapshot(
  alchemyUrl: string,
  address: string,
): Promise<WalletSnapshot> {
  const [balanceHex, txCountHex, tokenRes] = await Promise.all([
    alchemy<string>(alchemyUrl, "eth_getBalance", [address, "latest"]),
    alchemy<string>(alchemyUrl, "eth_getTransactionCount", [address, "latest"]),
    fetchTokens(alchemyUrl, address).catch(() => ({ tokens: [] as WalletToken[], total: 0 })),
  ]);

  return {
    address,
    network: "base",
    eth_balance: weiHexToEthString(balanceHex),
    eth_balance_wei: BigInt(balanceHex || "0x0").toString(),
    tx_count: Number(BigInt(txCountHex || "0x0")),
    tokens: tokenRes.tokens,
    token_count: tokenRes.total,
    basescan: `https://basescan.org/address/${address}`,
  };
}

/* ------------------------------------------------------------------ */
/*  Transfers + funding sources                                       */
/* ------------------------------------------------------------------ */

interface RawTransfer {
  from?: string;
  hash?: string;
  value?: number | string;
  asset?: string;
  metadata?: { blockTimestamp?: string };
}

async function fetchTransfers(
  url: string,
  address: string,
  count: number,
  order: "asc" | "desc",
): Promise<RawTransfer[]> {
  const res = await alchemy<{ transfers: RawTransfer[] }>(
    url,
    "alchemy_getAssetTransfers",
    [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        toAddress: address,
        category: ["external", "erc20"],
        maxCount: "0x" + count.toString(16),
        order,
        withMetadata: true,
      },
    ],
  );
  return res.transfers ?? [];
}

function toTransfer(t: RawTransfer): WalletTransfer {
  return {
    from: String(t.from ?? ""),
    value: typeof t.value === "number" ? t.value : Number(t.value ?? 0),
    asset: String(t.asset ?? ""),
    at: t.metadata?.blockTimestamp ?? "",
    hash: String(t.hash ?? ""),
  };
}

/* ------------------------------------------------------------------ */
/*  Intel (deep tier)                                                 */
/* ------------------------------------------------------------------ */

function buildRisk(snapshot: WalletSnapshot, ageDays: number | null): WalletIntel["risk"] {
  const flags: WalletRiskFlag[] = [];

  if (ageDays !== null && ageDays < 7) {
    flags.push({ code: "very_young_wallet", weight: 30, message: `Wallet is ${ageDays} days old (<7).` });
  } else if (ageDays !== null && ageDays < 30) {
    flags.push({ code: "young_wallet", weight: 15, message: `Wallet is ${ageDays} days old (<30).` });
  }

  if (snapshot.tx_count < 5) {
    flags.push({ code: "low_activity", weight: 20, message: `Only ${snapshot.tx_count} outgoing transactions.` });
  }

  if (snapshot.tx_count >= 100) {
    flags.push({ code: "established", weight: -10, message: `Established wallet (${snapshot.tx_count} txs).` });
  }

  if (ageDays !== null && ageDays > 365) {
    flags.push({ code: "mature_wallet", weight: -20, message: `Wallet older than a year.` });
  }

  if (BigInt(snapshot.eth_balance_wei) === 0n && snapshot.token_count === 0) {
    flags.push({ code: "empty_wallet", weight: 10, message: `No ETH and no ERC-20 tokens.` });
  }

  const delta = flags.reduce((acc, f) => acc + f.weight, 0);
  const score = Math.max(0, Math.min(100, 50 + delta));
  const level: "low" | "medium" | "high" = score >= 65 ? "high" : score >= 40 ? "medium" : "low";

  return { score, level, flags };
}

export async function getWalletIntel(
  alchemyUrl: string,
  address: string,
): Promise<WalletIntel> {
  const [snapshot, first, last] = await Promise.all([
    getWalletSnapshot(alchemyUrl, address),
    fetchTransfers(alchemyUrl, address, TRANSFERS_SAMPLE, "asc").catch(() => [] as RawTransfer[]),
    fetchTransfers(alchemyUrl, address, TRANSFERS_SAMPLE, "desc").catch(() => [] as RawTransfer[]),
  ]);

  const firstTs = first[0]?.metadata?.blockTimestamp ?? null;
  const lastTs = last[0]?.metadata?.blockTimestamp ?? null;
  const ageDays = firstTs ? Math.floor((Date.now() - Date.parse(firstTs)) / 86_400_000) : null;

  // Funding sources: unique senders of the earliest incoming transfers.
  const seen = new Set<string>();
  const funding: WalletTransfer[] = [];
  for (const t of first) {
    const from = String(t.from ?? "");
    if (!from || seen.has(from)) continue;
    seen.add(from);
    funding.push(toTransfer(t));
    if (funding.length >= 5) break;
  }

  return {
    ...snapshot,
    history: {
      first_tx_at: firstTs,
      last_tx_at: lastTs,
      wallet_age_days: ageDays,
      transfers_sampled: first.length + last.length,
    },
    funding_sources: funding,
    recent_transfers: last.map(toTransfer),
    risk: buildRisk(snapshot, ageDays),
  };
}
