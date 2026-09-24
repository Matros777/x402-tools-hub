/**
 * x402 Tools Hub — Receipt Notary core (v1).
 *
 * Produces a compact, verifiable receipt for something the agent "bought".
 * No outbound payment, no refetch of the resource. Body optional (max
 * 64KB) — if given, the server computes SHA-256 and cross-checks it
 * against a provided sha256. payment_tx is only normalized/stored, never
 * verified on-chain in v1.
 *
 * Used by:
 *   - GET  /tools/receipt-notary        (free page)
 *   - POST /api/receipt-notary/lookup   (free, for the page)
 *   - POST /api/receipt-notary          (paid, for agents, $0.001)
 */

export interface NotaryInput {
  /** The resource the agent paid for. */
  resource?: string;
  /** Pre-computed SHA-256 of the body (optional if body given). */
  sha256?: string;
  /** Response body (optional, max 64KB). */
  body?: string;
  /** Payment transaction hash (normalized, not on-chain verified in v1). */
  payment_tx?: string;
  /** Content type of the resource, e.g. application/json. */
  content_type?: string;
}

export interface NotaryResult {
  receipt_id: string;
  sha256: string;
  timestamp: string;
  resource: string | null;
  tx: string | null;
  bytes: number | null;
  match: "computed" | "verified" | "provided";
  notes: string[];
}

export const MAX_BODY = 64 * 1024;

function normalizeTx(tx: string | null): string | null {
  if (!tx) return null;
  const t = tx.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(t)) return t.toLowerCase();
  return null;
}

export async function notarize(input: NotaryInput): Promise<NotaryResult> {
  const notes: string[] = [];
  const resource = input.resource ? String(input.resource).slice(0, 2000) : null;
  const body = input.body === undefined || input.body === null ? null : String(input.body);
  const providedSha = input.sha256 ? String(input.sha256).trim().toLowerCase() : null;
  const tx = normalizeTx(input.payment_tx ? String(input.payment_tx) : null);
  const contentType = input.content_type ? String(input.content_type).slice(0, 120) : null;

  // ---- body size guard ----
  if (body !== null && body.length > MAX_BODY) {
    return {
      receipt_id: "",
      sha256: "",
      timestamp: "",
      resource,
      tx,
      bytes: body.length,
      match: "computed",
      notes: [
        `Body is ${body.length} bytes, exceeding the ${MAX_BODY} limit (413). Send only a pre-computed sha256 instead.`,
      ],
    };
  }

  // ---- compute hash ----
  let sha: string;
  let match: NotaryResult["match"] = "provided";
  if (body !== null) {
    const bytes = new TextEncoder().encode(body);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    sha = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (providedSha && providedSha !== sha) {
      notes.push(`Provided sha256 (${providedSha.slice(0, 16)}…) does not match computed (${sha.slice(0, 16)}…).`);
      match = "verified";
    } else if (providedSha) {
      notes.push("Provided sha256 matches computed body hash.");
      match = "verified";
    } else {
      match = "computed";
    }
  } else if (providedSha) {
    sha = providedSha;
  } else {
    return {
      receipt_id: "",
      sha256: "",
      timestamp: "",
      resource,
      tx,
      bytes: null,
      match: "provided",
      notes: ["Provide body or a pre-computed sha256."],
    };
  }

  const timestamp = new Date().toISOString();
  const receiptId = `x402-${timestamp.slice(0, 10).replace(/-/g, "")}-${sha.slice(0, 12)}`;

  if (!tx) notes.push("payment_tx missing or not a 0x + 64 hex hash — stored as null.");
  else notes.push("payment_tx normalized and stored (not on-chain verified in v1).");

  return {
    receipt_id: receiptId,
    sha256: sha,
    timestamp,
    resource,
    tx,
    bytes: body !== null ? body.length : null,
    match,
    notes,
  };
}