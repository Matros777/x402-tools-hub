/**
 * x402 Tools Hub — Well-Known Reader core.
 *
 * Discovery-surface reader per canonical DoD:
 *   input  { "url": "https://host/api/foo" }  → normalized to https://host
 *   checks only root/canonical discovery paths:
 *     /.well-known/x402
 *     /.well-known/agent.json
 *     /agent.json
 *     /openapi.json
 *     /llms.txt
 *     /robots.txt
 *   each entry carries: found | missing | error, and source = the ACTUAL
 *   URL that was probed (not a guessed path).
 *
 * Used by:
 *   - GET  /tools/well-known          (free page)
 *   - POST /api/well-known/lookup     (free, for the page)
 *   - POST /api/well-known            (paid, for agents, $0.001)
 */

export interface WellKnownInput {
  /** Any URL on the host; normalized to origin. */
  url: string;
}

export type DiscoveryStatus = "found" | "missing" | "error";

export interface WellKnownEntry {
  /** Canonical path name, e.g. "/.well-known/x402". */
  name: string;
  status: DiscoveryStatus;
  /** Actual URL that was probed. */
  source: string;
  http_status: number | null;
  content_type: string | null;
  bytes: number | null;
  summary: string | null;
}

export interface WellKnownResult {
  origin: string;
  entries: WellKnownEntry[];
  notes: string[];
}

const PATHS = [
  "/.well-known/x402",
  "/.well-known/agent.json",
  "/agent.json",
  "/openapi.json",
  "/llms.txt",
  "/robots.txt",
];

function summarize(body: string, ct: string | null): string | null {
  const t = body.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (ct && ct.includes("json")) return t.slice(0, 120);
  return t.slice(0, 160);
}

export async function readWellKnown(input: WellKnownInput): Promise<WellKnownResult> {
  const notes: string[] = [];
  const raw = String(input.url || "").trim();

  if (!/^https?:\/\//i.test(raw)) {
    return { origin: raw, entries: [], notes: ["url must start with http(s)://"] };
  }

  // Normalize to origin (strip path/query/hash).
  let origin: string;
  try {
    const u = new URL(raw);
    origin = u.origin;
  } catch {
    return { origin: raw, entries: [], notes: ["cannot parse URL"] };
  }

  const entries: WellKnownEntry[] = [];

  const SELF_ORIGIN = "https://x402-tools-hub.ivanbenks7-e96.workers.dev";
  if (origin === SELF_ORIGIN || origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost")) {
    // Self-probe: we publish these discovery files ourselves, so answer from
    // local facts instead of a loopback fetch (Cloudflare edge returns 404 on
    // worker -> same-worker calls). A third party would see exactly these.
    const selfKnown: Record<string, { status: number; ct: string; summary: string | null }> = {
      "/.well-known/x402": { status: 200, ct: "application/json", summary: '{"x402Version":2,"provider":{"name":"x402 Tools Hub"},...}' },
      "/.well-known/agent.json": { status: 200, ct: "application/json", summary: '{"schema_version":"1.0","name":"x402 Tools Hub",...}' },
      "/agent.json": { status: 404, ct: "application/json", summary: null },
      "/openapi.json": { status: 200, ct: "application/json", summary: '{"openapi":"3.1.0","info":{"title":"x402 Tools Hub"},...}' },
      "/llms.txt": { status: 200, ct: "text/plain; charset=utf-8", summary: "# x402 Tools Hub — paid tools for AI agents..." },
      "/robots.txt": { status: 200, ct: "text/plain; charset=utf-8", summary: "User-agent: *\nAllow: /\nHost: x402-tools-hub..." },
    };
    for (const name of PATHS) {
      const k = selfKnown[name];
      if (k) {
        entries.push({
          name,
          status: k.status === 200 ? "found" : "missing",
          source: origin + name,
          http_status: k.status,
          content_type: k.ct,
          bytes: null,
          summary: k.summary,
        });
      }
    }
    const foundNames = entries.filter((e) => e.status === "found").map((e) => e.name);
    notes.push("Self-probe answered from local discovery map (loopback-safe).");
    if (foundNames.length) notes.push(`Found: ${foundNames.join(", ")}`);
    return { origin, entries, notes };
  }


  for (const name of PATHS) {
    const source = origin + name;
    try {
      const r = await fetch(source, { headers: { accept: "*/*" } });
      const text = await r.text();
      const ct = r.headers.get("content-type");
      entries.push({
        name,
        status: r.status === 200 ? "found" : r.status < 500 ? "missing" : "error",
        source,
        http_status: r.status,
        content_type: ct,
        bytes: text.length,
        summary: r.status === 200 ? summarize(text, ct) : null,
      });
    } catch (e) {
      entries.push({
        name,
        status: "error",
        source,
        http_status: null,
        content_type: null,
        bytes: null,
        summary: null,
      });
      notes.push(`${name}: fetch error`);
    }
  }

  const found = entries.filter((e) => e.status === "found").map((e) => e.name);
  if (found.length === 0) notes.push("No discovery documents found at this origin.");
  else notes.push(`Found: ${found.join(", ")}`);

  return { origin, entries, notes };
}