/**
 * x402 Tools Hub — 402 Probe core (v0).
 *
 * Answer the pre-payment question: "is this URL really an x402 endpoint
 * right now, and under what exact conditions?"
 *
 * Contract (advisor v0):
 *   mode: challenge — one unpaid request, parse the 402
 *         describe   — challenge + try /.well-known/x402 on the same origin
 *   Rules:
 *     - 200 without 402 → x402: false (do not mask as "live API")
 *     - 404/405 on GET  → one retry as POST with empty JSON, then stop
 *     - hard timeout, response body capped
 *     - challenge_valid = schema of fields is valid, NOT "payment will pass"
 *     - payTo/network/asset normalized
 *     - max 1 redirect by default
 *     - never log third-party bodies
 *
 * Used by:
 *   - GET  /tools/402-probe          (free page)
 *   - POST /api/402-probe/lookup     (free, for the page)
 *   - POST /api/402-probe            (paid, for agents, $0.002)
 */

export interface ProbeInput {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  follow?: boolean;
  timeout_ms?: number;
  mode?: "challenge" | "describe";
}

export interface ChallengeInfo {
  scheme: string | null;
  network: string | null;
  asset: string | null;
  amount_atomic: string | null;
  amount_usd: number | null;
  pay_to: string | null;
  resource: string | null;
  description: string | null;
  max_timeout_seconds: number | null;
  facilitator: string | null;
  extra: Record<string, unknown>;
}

export interface ProbeResult {
  ok: boolean;
  url: string;
  http_status: number | null;
  x402: boolean;
  method_tried: string;
  challenge: ChallengeInfo | null;
  headers_present: string[];
  parse: { challenge_valid: boolean; errors: string[] };
  hints: { post_only: boolean; likely_needs_body: boolean; well_known: string | null };
  notes: string[];
}

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const MAX_BODY = 64 * 1024;
const MAX_REDIRECTS = 1;

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

function normalizeNetwork(network: string | null): string | null {
  if (!network) return null;
  if (network === "eip155:8453" || /^base$/i.test(network)) return "base";
  if (/eip155:84532/i.test(network)) return "base-sepolia";
  return network;
}

function normalizeAsset(asset: string | null): string | null {
  if (!asset) return null;
  if (/^0x833589fcd6edb6e08f4c7c32d4f71b54bda02913$/i.test(asset) || /^usdc$/i.test(asset)) return "USDC";
  return asset;
}

async function doFetch(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  follow: boolean,
): Promise<{ res: Response | null; body: string; error: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      method,
      headers: { accept: "application/json, */*", ...headers },
      redirect: follow ? "follow" : "manual",
      signal: ctrl.signal,
    };
    if (body !== undefined && body !== null) {
      init.headers = { ...init.headers, "content-type": "application/json" };
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    return { res, body: text.slice(0, MAX_BODY), error: null };
  } catch (e) {
    return { res: null, body: "", error: String((e as Error).message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function parseChallenge(body: string, headerVal: string | null | undefined): { ch: ChallengeInfo | null; valid: boolean; errors: string[] } {
  let parsed: any = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = b64decode(headerVal || body);
  }
  if (!parsed) return { ch: null, valid: false, errors: ["no parseable payment config"] };

  const acc = Array.isArray(parsed.accepts) && parsed.accepts.length ? parsed.accepts[0] : parsed;
  const resource =
    parsed.resource && typeof parsed.resource === "object"
      ? parsed.resource
      : typeof parsed.resource === "string"
        ? { url: parsed.resource }
        : null;

  const amount = acc.amount != null ? String(acc.amount) : null;
  const amountUsd =
    amount && /^0x833589fcd6edb6e08f4c7c32d4f71b54bda02913$/i.test(String(acc.asset ?? ""))
      ? Number(amount) / 1e6
      : null;

  const ch: ChallengeInfo = {
    scheme: acc.scheme ?? null,
    network: normalizeNetwork(acc.network ?? null),
    asset: normalizeAsset(acc.asset ?? null),
    amount_atomic: amount,
    amount_usd: amountUsd,
    pay_to: acc.payTo ?? null,
    resource: resource?.url ?? null,
    description: resource?.description ?? parsed.description ?? null,
    max_timeout_seconds: acc.maxTimeoutSeconds ?? null,
    facilitator: null,
    extra: acc.extra && typeof acc.extra === "object" ? acc.extra : {},
  };

  const errors: string[] = [];
  if (!ch.scheme) errors.push("missing scheme");
  if (!ch.network) errors.push("missing network");
  if (!ch.asset) errors.push("missing asset");
  if (!ch.pay_to || !/^0x[0-9a-fA-F]{40}$/.test(ch.pay_to)) errors.push("missing/invalid payTo");
  if (amount === null || !/^\d+$/.test(amount)) errors.push("missing/invalid amount");

  return { ch, valid: errors.length === 0, errors };
}

export async function probeEndpoint(input: ProbeInput): Promise<ProbeResult> {
  const url = String(input.url || "").trim();
  const mode = input.mode === "describe" ? "describe" : "challenge";
  const timeoutMs = Math.min(Math.max(Number(input.timeout_ms) || 8000, 1000), 20000);
  const follow = input.follow !== false;
  const notes: string[] = [];

  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, url, http_status: null, x402: false, method_tried: "GET", challenge: null, headers_present: [], parse: { challenge_valid: false, errors: ["url must start with http(s)://"] }, hints: { post_only: false, likely_needs_body: false, well_known: null }, notes: ["invalid url"] };
  }

  const origin = new URL(url).origin;
  let method = (input.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") method = "GET";

  // Attempt 1
  let { res, body, error } = await doFetch(url, method, input.body, input.headers || {}, timeoutMs, follow);
  let status = res?.status ?? null;

  // 404/405 on GET → one retry as POST with empty JSON
  let retried = false;
  if ((status === 404 || status === 405) && method === "GET") {
    ({ res, body, error } = await doFetch(url, "POST", {}, input.headers || {}, timeoutMs, follow));
    status = res?.status ?? null;
    method = "POST";
    retried = true;
    notes.push("GET returned 404/405 — retried once as POST with empty JSON.");
  }

  if (error) notes.push(`fetch error: ${error}`);

  const headersPresent: string[] = [];
  const ph = res?.headers.get("PAYMENT-REQUIRED") || res?.headers.get("payment-required");
  if (ph) headersPresent.push("PAYMENT-REQUIRED");

  const isX402 = status === 402;
  const { ch, valid, errors } = isX402 ? parseChallenge(body, ph) : { ch: null, valid: false, errors: ["no 402 returned"] };

  if (status !== null && status !== 402 && status < 400) notes.push(`HTTP ${status} without 402 — not an x402 endpoint (or payment already satisfied).`);
  if (status !== null && status >= 400 && status !== 402) notes.push(`HTTP ${status} — endpoint returned an error, not a payment challenge.`);

  // describe mode: check well-known on same origin
  let wellKnown: string | null = null;
  if (mode === "describe" && isX402) {
    try {
      const wk = await fetch(`${origin}/.well-known/x402`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
      if (wk.ok) wellKnown = `${origin}/.well-known/x402`;
      else {
        const wk2 = await fetch(`${origin}/.well-known/x402-discovery`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
        if (wk2.ok) wellKnown = `${origin}/.well-known/x402-discovery`;
      }
    } catch {
      wellKnown = null;
    }
  }

  return {
    ok: true,
    url,
    http_status: status,
    x402: isX402,
    method_tried: method,
    challenge: ch,
    headers_present: headersPresent,
    parse: { challenge_valid: valid, errors },
    hints: {
      post_only: retried || (ch?.scheme ? false : false),
      likely_needs_body: retried,
      well_known: wellKnown,
    },
    notes,
  };
}