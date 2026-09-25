/**
 * x402 Tools Hub — in-memory telemetry.
 *
 * No DB, no KV, no Analytics Engine. Counters live in the Worker isolate
 * and reset when Cloudflare recycles it. We say so honestly in the API:
 * `since` records when the current isolate started counting.
 *
 * What we track:
 *   - total API calls (all /api/* hits below the x402 middleware)
 *   - calls per tool slug
 *   - calls per HTTP status bucket (200 / 402 / 4xx / 5xx)
 *   - first/last call timestamps
 *
 * Internal self-probes (X-Internal-Probe: 1) are excluded.
 */

export const TELEMETRY_HEADER = "x-internal-probe";

interface ToolCounter {
  calls: number;
  paid: number;   // HTTP 200 (settled)
  unpaid: number; // HTTP 402 (requested, not paid)
  errors: number; // 4xx other / 5xx
}

interface TelemetryState {
  started_at: string;
  total_calls: number;
  per_status: Record<string, number>;
  per_tool: Record<string, ToolCounter>;
  first_call_at: string | null;
  last_call_at: string | null;
}

const state: TelemetryState = {
  started_at: new Date().toISOString(),
  total_calls: 0,
  per_status: {},
  per_tool: {},
  first_call_at: null,
  last_call_at: null,
};

/** Best-effort tool slug from an /api/<slug>... path. Returns null for meta routes. */
function slugFromPath(path: string): string | null {
  const m = path.match(/^\/api\/([a-z0-9-]+)/i);
  if (!m) return null;
  const slug = m[1];
  if (!slug) return null;
  if (slug === "list" || slug === "stats" || slug === "status") return null;
  return slug;
}

/** Record a single /api/* call. Called from middleware after the response. */
export function recordCall(path: string, status: number): void {
  const now = new Date().toISOString();
  state.total_calls += 1;
  if (!state.first_call_at) state.first_call_at = now;
  state.last_call_at = now;

  const bucket = status >= 500 ? "5xx" : status >= 400 ? "4xx" : String(status);
  state.per_status[bucket] = (state.per_status[bucket] ?? 0) + 1;

  const slug = slugFromPath(path);
  if (!slug) return;
  let c = state.per_tool[slug];
  if (!c) {
    c = { calls: 0, paid: 0, unpaid: 0, errors: 0 };
    state.per_tool[slug] = c;
  }
  c.calls += 1;
  if (status === 200) c.paid += 1;
  else if (status === 402) c.unpaid += 1;
  else if (status >= 400) c.errors += 1;
}

export interface TelemetrySnapshot {
  since: string;
  note: string;
  total_calls: number;
  per_status: Record<string, number>;
  per_tool: Array<{ slug: string; calls: number; paid: number; unpaid: number; errors: number }>;
  first_call_at: string | null;
  last_call_at: string | null;
}

/** Snapshot for /api/stats and the /status page. */
export function snapshot(): TelemetrySnapshot {
  const tools = Object.entries(state.per_tool)
    .map(([slug, c]) => ({ slug, ...c }))
    .sort((a, b) => b.calls - a.calls);
  return {
    since: state.started_at,
    note: "In-memory counters, reset when the Cloudflare Worker isolate is recycled.",
    total_calls: state.total_calls,
    per_status: { ...state.per_status },
    per_tool: tools,
    first_call_at: state.first_call_at,
    last_call_at: state.last_call_at,
  };
}
