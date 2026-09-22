/**
 * x402 Tools Hub — main Hono application
 *
 * Routes:
 *   GET  /                     -> landing page
 *   GET  /tools/:name          -> tool page (web form, free for humans)
 *   POST /api/:name            -> tool API (x402 payment required for agents)
 *   GET  /api/list             -> machine-readable tool catalog
 *   GET  /llms.txt             -> LLM discovery file
 *   GET  /openapi.json         -> OpenAPI spec
 *   GET  /.well-known/agent.json -> agent manifest
 *   GET  /health               -> health check
 */

import { Hono } from "hono";
import { getConfig, TOOLS } from "./config";
import { landingPage } from "./web/landing";
import { jsonStudioPage } from "./web/tools/json-studio";
import { jwtInspectorPage } from "./web/tools/jwt-inspector";
import { x402v2 } from "./x402";

export interface Env {
  X402_NETWORK?: string;
  X402_FACILITATOR_URL?: string;
  X402_PAY_TO?: string;
  SITE_NAME?: string;
  SITE_URL?: string;
  // Cloudflare Worker bindings are an open bag of strings; the index
  // signature lets `Env` satisfy `Record<string, string | undefined>`
  // (required by `getConfig`).
  [key: string]: string | undefined;
}

const app = new Hono<{ Bindings: Env }>();

/* ------------------------------------------------------------------ */
/*  Landing + health                                                   */
/* ------------------------------------------------------------------ */

app.get("/", (c) => {
  const cfg = getConfig(c.env);
  return c.html(landingPage(cfg));
});

app.get("/health", (c) =>
  c.json({ status: "ok", name: getConfig(c.env).siteName, ts: Date.now() })
);

/* ------------------------------------------------------------------ */
/*  Tool pages (HTML, free for humans)                                 */
/* ------------------------------------------------------------------ */

// Registry of tools that have a dedicated client-side page renderer.
const TOOL_PAGES: Record<string, (cfg: ReturnType<typeof getConfig>) => string> = {
  "json-studio": jsonStudioPage,
  "jwt-inspector": jwtInspectorPage,
};

app.get("/tools/:name", (c) => {
  const name = c.req.param("name");
  const tool = TOOLS[name];
  if (!tool) return c.notFound();
  const cfg = getConfig(c.env);

  const renderer = TOOL_PAGES[name];
  if (renderer) return c.html(renderer(cfg));

  // Fallback for tools that don't yet have a custom page
  return c.html(
    `<!DOCTYPE html><html lang="en"><head>` +
      `<meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${name} — ${cfg.siteName}</title>` +
      `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
      `</head><body style="background:#0b0f0e;color:#e6f0ec;font-family:monospace;padding:2rem">` +
      `<h1>${name}</h1><p>${tool.description}</p>` +
      `<p>Price (API): $${tool.priceUsd} USDC</p>` +
      `<p><a style="color:#10e0a0" href="/">← back</a></p>` +
      `</body></html>`
  );
});

/* ------------------------------------------------------------------ */
/*  Discovery                                                          */
/* ------------------------------------------------------------------ */

app.get("/api/list", (c) => {
  const cfg = getConfig(c.env);
  const tools = Object.entries(TOOLS).map(([name, t]) => ({
    name,
    path: t.path,
    method: "POST",
    price_usd: t.priceUsd,
    description: t.description,
    free_for_humans: t.freeForHumans,
  }));
  // NOTE: `pay_to` is intentionally omitted — it is exposed only via the
  // x402 402 response from the payment middleware, never in discovery files.
  return c.json({
    name: cfg.siteName,
    url: cfg.siteUrl,
    network: cfg.network,
    tools,
  });
});

app.get("/openapi.json", (c) => {
  const cfg = getConfig(c.env);
  const paths: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(TOOLS)) {
    paths[t.path] = {
      post: {
        operationId: name,
        summary: t.description,
        responses: { "200": { description: "OK" }, "402": { description: "Payment Required" } },
      },
    };
  }
  return c.json({
    openapi: "3.1.0",
    info: { title: cfg.siteName, version: "0.1.0" },
    servers: [{ url: cfg.siteUrl }],
    paths,
  });
});

app.get("/llms.txt", (c) => {
  const cfg = getConfig(c.env);
  const lines: string[] = [];
  lines.push(`# ${cfg.siteName}`);
  lines.push("");
  lines.push("> Paid tools for AI agents, free tools for humans. x402 payments on " + cfg.network + ".");
  lines.push("");
  lines.push("## Tools");
  for (const [name, t] of Object.entries(TOOLS)) {
    lines.push(`- ${name}: ${t.description} ($${t.priceUsd} USDC) -> POST ${t.path}`);
  }
  lines.push("");
  lines.push(`Discovery: ${cfg.siteUrl}/api/list`);
  return c.text(lines.join("\n"), 200, { "content-type": "text/plain; charset=utf-8" });
});

app.get("/.well-known/agent.json", (c) => {
  const cfg = getConfig(c.env);
  // NOTE: `pay_to` is intentionally omitted here. Agents discover the
  // receiving address from the x402 402 response, not from a public manifest.
  return c.json({
    schema_version: "1.0",
    name: cfg.siteName,
    description: "Paid tools hub for AI agents.",
    url: cfg.siteUrl,
    payment: { protocol: "x402", network: cfg.network },
    tools: Object.keys(TOOLS),
  });
});

/* ------------------------------------------------------------------ */
/*  x402 payment protection (paid API only)                            */
/* ------------------------------------------------------------------ */

// Enforces x402 payment on every /api/* path present in the route table.
// Discovery endpoints (/api/list, /openapi.json) are intentionally absent
// from the table, so the middleware passes them straight through.
// NOTE: registered AFTER the discovery routes so they stay open.
app.use("/api/*", async (c, next) => {
  const cfg = getConfig(c.env);
  if (!cfg.payTo) {
    return c.json(
      { error: "payment_not_configured", hint: "X402_PAY_TO secret is missing" },
      503
    );
  }
  return x402v2(cfg)(c, next);
});

/* ------------------------------------------------------------------ */
/*  Paid tool handlers (after successful payment)                      */
/* ------------------------------------------------------------------ */

app.post("/api/web-markdown", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const url = body.url;
  if (!url) return c.json({ error: "url required" }, 400);
  const r = await fetch(url);
  const html = await r.text();
  // simple conversion: strip scripts/styles, keep text
  const md = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return c.json({ url, markdown: md });
});

app.post("/api/url-metadata", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const url = body.url;
  if (!url) return c.json({ error: "url required" }, 400);
  const r = await fetch(url);
  const html = await r.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  const favicon = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
  return c.json({ url, title, description: desc, favicon });
});

app.post("/api/token-counter", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = body.text ?? "";
  // rough estimate: ~4 chars per token
  const tokens = Math.ceil(text.length / 4);
  return c.json({ text_length: text.length, estimated_tokens: tokens });
});

// Server-side JSON formatter for agents. Mirrors the browser JSON Studio:
// format / minify / validate. Query and diff stay browser-only for now.
app.post("/api/json-studio", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const raw = body.json;
  if (typeof raw !== "string") return c.json({ error: "json (string) required" }, 400);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return c.json({ ok: false, error: String((e as Error).message) }, 400);
  }

  const mode = body.mode === "minify" ? "minify" : "format";
  const indentRaw = body.indent ?? 2;
  const indent = indentRaw === "tab" || indentRaw === "\t" ? "\t" : Number(indentRaw);

  const result =
    mode === "minify" ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent);

  return c.json({ ok: true, mode, result });
});

// Server-side JWT decoder for agents. Decodes header + payload and reports
// basic temporal claims (exp/nbf/iat). Signature verification is intentionally
// NOT performed here — agents that need to verify should do it locally, the
// same way the browser page does via WebCrypto.
app.post("/api/jwt-inspector", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = body.token;
  if (typeof token !== "string" || !token) {
    return c.json({ error: "token (string) required" }, 400);
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return c.json({ ok: false, error: "not a JWT (expected 3 dot-separated parts)" }, 400);
  }

  const decodeSegment = (seg: string): unknown => {
    // base64url → base64 → utf-8
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  };

  let header: unknown;
  let payload: unknown;
  try {
    header = decodeSegment(parts[0]!);
    payload = decodeSegment(parts[1]!);
  } catch (e) {
    return c.json({ ok: false, error: "failed to decode: " + String((e as Error).message) }, 400);
  }

  const claims: Record<string, unknown> = {};
  const now = Math.floor(Date.now() / 1000);
  const pl = payload as Record<string, unknown>;
  if (typeof pl?.exp === "number") {
    claims.exp = pl.exp;
    claims.expired = pl.exp < now;
    claims.expires_in = pl.exp - now;
  }
  if (typeof pl?.nbf === "number") {
    claims.nbf = pl.nbf;
    claims.not_before = pl.nbf > now;
  }
  if (typeof pl?.iat === "number") claims.iat = pl.iat;

  return c.json({
    ok: true,
    header,
    payload,
    signature: parts[2],
    claims,
    note: "signature not verified (no secret/key provided)",
  });
});

/* ------------------------------------------------------------------ */
/*  404 + errors                                                       */
/* ------------------------------------------------------------------ */

app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));

app.notFound((c) =>
  c.html(
    `<!DOCTYPE html><html lang="en"><head>` +
      `<meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>404 — Not found</title>` +
      `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
      `</head><body style="background:#0b0f0e;color:#e6f0ec;font-family:monospace;padding:3rem;text-align:center">` +
      `<h1 style="color:#ffb454">404</h1><p>Not found</p>` +
      `<a style="color:#10e0a0" href="/">← home</a></body></html>`,
    404
  )
);

app.onError((err, c) => {
  console.error("worker error:", err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
