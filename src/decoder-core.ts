/**
 * x402 Tools Hub — Payment Decoder core.
 *
 * Decode a PAYMENT-REQUIRED header (base64 JSON, x402 v2) or an
 * X-PAYMENT payload into its fields: scheme, asset, network, amount,
 * deadline, payTo, and a per-field validity check.
 *
 * Used by:
 *   - GET  /tools/payment-decoder        (free page)
 *   - POST /api/payment-decoder/lookup   (free, for the page)
 *   - POST /api/payment-decoder          (paid, for agents, $0.001)
 */

export interface DecodeInput {
  /** Raw PAYMENT-REQUIRED header (base64) or JSON string. */
  payload: string;
}

export interface DecodeResult {
  parsed: boolean;
  x402_version: number | null;
  resource_url: string | null;
  description: string | null;
  scheme: string | null;
  network: string | null;
  asset: string | null;
  amount_atomic: string | null;
  amount_usd: number | null;
  pay_to: string | null;
  max_timeout_seconds: number | null;
  deadline: string | null;
  fields_valid: Record<string, boolean>;
  notes: string[];
}

function b64decode(s: string): any {
  try {
    let t = s.replace(/-/g, "+").replace(/_/g, "/");
    while (t.length % 4) t += "=";
    const bin = atob(t);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function decodePayment(input: DecodeInput): DecodeResult {
  const raw = String(input.payload || "").trim();
  const notes: string[] = [];
  let parsed: any = null;

  // Try JSON directly, then base64.
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = b64decode(raw);
  }

  if (!parsed) {
    return {
      parsed: false,
      x402_version: null,
      resource_url: null,
      description: null,
      scheme: null,
      network: null,
      asset: null,
      amount_atomic: null,
      amount_usd: null,
      pay_to: null,
      max_timeout_seconds: null,
      deadline: null,
      fields_valid: {},
      notes: ["Payload is neither valid JSON nor valid base64 JSON."],
    };
  }

  const acc = Array.isArray(parsed.accepts) && parsed.accepts.length ? parsed.accepts[0] : parsed;
  const resource = parsed.resource && typeof parsed.resource === "object" ? parsed.resource : null;

  const scheme = acc.scheme ?? null;
  const network = acc.network ?? null;
  const asset = acc.asset ?? null;
  const amount = acc.amount != null ? String(acc.amount) : null;
  const payTo = acc.payTo ?? null;
  const maxTimeout = acc.maxTimeoutSeconds ?? null;
  const deadline = parsed.deadline ?? acc.deadline ?? null;

  const amountUsd =
    amount && asset && /usdc|0x833589fcd6edb6e08f4c7c32d4f71b54bda02913/i.test(asset)
      ? Number(amount) / 1e6
      : null;

  const fieldsValid: Record<string, boolean> = {
    scheme: Boolean(scheme),
    network: Boolean(network),
    asset: Boolean(asset),
    amount: amount !== null && /^\d+$/.test(amount),
    pay_to: Boolean(payTo) && /^0x[0-9a-fA-F]{40}$/.test(payTo ?? ""),
    resource_url: Boolean(resource?.url || parsed.resource_url || parsed.resource),
  };

  const invalid = Object.entries(fieldsValid).filter(([, v]) => !v).map(([k]) => k);
  if (invalid.length) notes.push(`Missing/invalid fields: ${invalid.join(", ")}`);
  if (!invalid.length) notes.push("All key payment fields are present and well-formed.");

  return {
    parsed: true,
    x402_version: parsed.x402Version ?? null,
    resource_url: resource?.url ?? parsed.resource_url ?? null,
    description: resource?.description ?? parsed.description ?? null,
    scheme,
    network,
    asset,
    amount_atomic: amount,
    amount_usd: amountUsd,
    pay_to: payTo,
    max_timeout_seconds: maxTimeout,
    deadline,
    fields_valid: fieldsValid,
    notes,
  };
}