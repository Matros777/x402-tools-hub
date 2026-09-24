/**
 * x402 Tools Hub — Well-Known Reader core.
 *
 * Fetch the discovery surface of any host in one call:
 *   /.well-known/x402-discovery, llms.txt, openapi.json,
 *   robots.txt, agent.json (/.well-known/agent.json), sitemap.xml.
 * Returns a compact "service card".
 *
 * Used by:
 *   - GET  /tools/well-known-reader        (free page)
 *   - POST /api/well-known-reader/lookup   (free, for the page)
 *   - POST /api/well-known-reader          (paid, for agents, $0.001)
 */

export interface WellKnownInput {
  /** Origin, e.g. https://x402-tools-hub.ivanbenks7-e96.workers.dev */
  origin: string;
}

export interface WellKnownEntry {
  path: string;
  status: number | null;
  content_type: string | null;
  bytes: number | null;
  summary: string | null;
}

export interface WellKnownResult {
  origin: string;
  entries: WellKnownEntry[];
  has_x402_discovery: boolean;
  has_llms: boolean;
  has_openapi: boolean;
  has_agent_json: boolean;
  notes: string[];
}

const PATHS = [
  "/.well-known/x402-discovery",
  "/llms.txt",
  "/openapi.json",
  "/robots.txt",
  "/.well-known/agent.json",
  "/sitemap.xml",
];

function summarize(body: string, ct: string | null): string | null {
  const t = body.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (ct && ct.includes("json")) return t.slice(0, 120);
  return t.slice(0, 160);
}

export async function readWellKnown(input: WellKnownInput): Promise<WellKnownResult> {
  const origin = String(input.origin || "").trim().replace(/\/+$/, "");
  const notes: string[] = [];
  const entries: WellKnownEntry[] = [];

  if (!/^https?:\/\//i.test(origin)) {
    notes.push("Origin must start with http(s)://");
    return { origin, entries, has_x402_discovery: false, has_llms: false, has_openapi: false, has_agent_json: false, notes };
  }

  for (const path of PATHS) {
    try {
      const r = await fetch(origin + path, { headers: { accept: "*/*" } });
      const text = await r.text();
      const ct = r.headers.get("content-type");
      entries.push({
        path,
        status: r.status,
        content_type: ct,
        bytes: text.length,
        summary: r.status < 400 ? summarize(text, ct) : null,
      });
    } catch (e) {
      entries.push({ path, status: null, content_type: null, bytes: null, summary: null });
      notes.push(`${path}: fetch failed`);
    }
  }

  const has = (p: string) => entries.find((e) => e.path === p)?.status === 200;

  return {
    origin,
    entries,
    has_x402_discovery: has("/.well-known/x402-discovery"),
    has_llms: has("/llms.txt"),
    has_openapi: has("/openapi.json"),
    has_agent_json: has("/.well-known/agent.json"),
    notes,
  };
}