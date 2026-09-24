/**
 * x402 Tools Hub — Address Toolkit core.
 *
 * Validate and describe EVM addresses on Base/ETH: EIP-55 checksum,
 * lowercase/checksum forms, contract-vs-EOA detection (via Alchemy when
 * available), chain hint and a Basescan link. Pure + one optional on-chain
 * lookup, no database.
 *
 * Used by:
 *   - GET  /tools/address-toolkit          (free page)
 *   - POST /api/address-toolkit/lookup     (free, for the page)
 *   - POST /api/address-toolkit            (paid, for agents)
 */

import { isValidEvmAddress, normalizeAddress } from "./wallet-intel-core";

export const BASESCAN_ADDR = "https://basescan.org/address/";

/* ------------------------------------------------------------------ */
/*  EIP-55 checksum                                                    */
/* ------------------------------------------------------------------ */

/** Keccak-256 via WebCrypto (SHA-256 is NOT keccak; we need keccak). */
async function keccak256Hex(input: string): Promise<string> {
  // Cloudflare Workers supports crypto.subtle only for standard hashes.
  // For EIP-55 we need keccak256; fall back to a tiny pure-JS impl if
  // crypto.subtle lacks keccak. In practice we keep a pure JS keccak below.
  const { keccak_256 } = await import("./keccak");
  return keccak_256(input);
}

/**
 * Convert a lowercase/hex EVM address to its EIP-55 checksum form.
 * Returns null if the input is not a valid 20-byte address.
 */
export async function toChecksumAddress(raw: string): Promise<string | null> {
  const addr = normalizeAddress(raw);
  if (!addr) return null;
  const clean = addr.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(clean)) return null;

  const hash = await keccak256Hex(clean);
  let out = "0x";
  for (let i = 0; i < clean.length; i++) {
    out +=
      parseInt(hash[i]!, 16) >= 8
        ? clean[i]!.toUpperCase()
        : clean[i]!;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Address description                                                */
/* ------------------------------------------------------------------ */

export interface AddressInfo {
  input: string;
  valid: boolean;
  address: string | null;
  checksum: string | null;
  is_checksum: boolean;
  is_lowercase: boolean;
  is_uppercase: boolean;
  has_0x_prefix: boolean;
  chain_hint: string | null;
  type: "eoa" | "contract" | "unknown";
  basescan: string | null;
  notes: string[];
}

/**
 * Describe an address. `checkType` uses Alchemy when provided and
 * `raw` is valid; otherwise type stays "unknown" and we note it.
 */
export async function describeAddress(
  raw: string,
  alchemyUrl?: string,
): Promise<AddressInfo> {
  const notes: string[] = [];
  const valid = isValidEvmAddress(raw);

  if (!valid) {
    return {
      input: raw,
      valid: false,
      address: null,
      checksum: null,
      is_checksum: false,
      is_lowercase: false,
      is_uppercase: false,
      has_0x_prefix: /^0x/i.test(raw),
      chain_hint: null,
      type: "unknown",
      basescan: null,
      notes: ["Not a valid 20-byte EVM address."],
    };
  }

  const normalized = normalizeAddress(raw);
  const checksum = await toChecksumAddress(normalized);
  const isLower = normalized === normalized.toLowerCase();
  const isUpper = /^[0-9A-F]+$/.test(normalized.replace(/^0x/, ""));
  const isChecksum = checksum !== null && normalized === checksum;

  // naive chain hint: Base addresses are plain EVM, no chain suffix here
  const chainHint = null;

  let type: "eoa" | "contract" | "unknown" = "unknown";
  if (alchemyUrl && checksum) {
    try {
      const r = await fetch(alchemyUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getCode",
          params: [checksum, "latest"],
        }),
      });
      const j = (await r.json()) as { result?: string };
      type = j.result && j.result !== "0x" ? "contract" : "eoa";
    } catch {
      notes.push("Type check via Alchemy failed; type is unknown.");
    }
  } else if (!alchemyUrl) {
    notes.push("No Alchemy configured — EOA/contract type not checked.");
  }

  if (chainHint) notes.push(`Chain hint: ${chainHint}.`);

  return {
    input: raw,
    valid: true,
    address: normalized,
    checksum,
    is_checksum: isChecksum,
    is_lowercase: isLower,
    is_uppercase: isUpper,
    has_0x_prefix: /^0x/i.test(raw),
    chain_hint: chainHint,
    type,
    basescan: checksum ? BASESCAN_ADDR + checksum : null,
    notes,
  };
}