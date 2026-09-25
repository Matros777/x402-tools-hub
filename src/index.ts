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
import { explainGit } from "./web/tools/git-dict";
import { jwtInspectorPage } from "./web/tools/jwt-inspector";
import { tokenCounterPage } from "./web/tools/token-counter";
import { webMarkdownPage } from "./web/tools/web-markdown";
import { urlMetadataPage } from "./web/tools/url-metadata";
import { regexMentorPage } from "./web/tools/regex-mentor";
import { encoderHubPage } from "./web/tools/encoder-hub";
import { diffProPage } from "./web/tools/diff-pro";
import { timeToolkitPage } from "./web/tools/time-toolkit";
import { envStudioPage } from "./web/tools/env-studio";
import { hashStudioPage } from "./web/tools/hash-studio";
import { colorPalettePage } from "./web/tools/color-palette";
import { unitConverterPage } from "./web/tools/unit-converter";
import { gitExplainerPage } from "./web/tools/git-explainer";
import { metaTagsPage } from "./web/tools/meta-tags";
import { walletIntelPage } from "./web/tools/wallet-intel";
import { getWalletIntel, getWalletSnapshot, isValidEvmAddress, normalizeAddress } from "./wallet-intel-core";
import { flightRecorderPage } from "./web/tools/flight-recorder";
import { agentPassportPage } from "./web/tools/agent-passport";
import { getReceipts, getPassport } from "./trust-core";
import { x402SimulatePage } from "./web/tools/x402-simulate";
import { merchantTrustPage } from "./web/tools/merchant-trust";
import { agentRegistryPage } from "./web/tools/agent-registry";
import { agentStudioPage } from "./web/tools/agent-studio";
import { addressToolkitPage } from "./web/tools/address-toolkit";
import { baseGasPage } from "./web/tools/base-gas";
import { agentIntelPage } from "./web/tools/agent-intel";
import { agentRoutePage } from "./web/tools/agent-route";
import { x402ProbePage } from "./web/tools/402-probe";
import { wellKnownPage } from "./web/tools/well-known";
import { agentHealthPage } from "./web/tools/agent-health";
import { paymentDecoderPage } from "./web/tools/payment-decoder";
import { receiptNotaryPage } from "./web/tools/receipt-notary";
import { tokenQuotePage } from "./web/tools/token-quote";
import { tokenInspectorPage } from "./web/tools/token-inspector";
import { simulateX402 } from "./simulate-core";
import { getMerchantTrust } from "./merchant-core";
import { getAgentRegistry } from "./registry-core";
import { dryRunAgent, type AgentInput } from "./agent-core";
import { describeAddress } from "./address-core";
import { getBaseGas } from "./gas-core";
import { runAgentIntel, type AgentIntelInput } from "./agent-intel-core";
import { routeTask, type RouteInput } from "./route-core";
import { probeEndpoint, type ProbeInput } from "./probe-core";
import { readWellKnown, type WellKnownInput } from "./wellknown-core";
import { runAgentHealth, type HealthInput } from "./health-core";
import { decodePayment, type DecodeInput } from "./decoder-core";
import { notarize, type NotaryInput, MAX_BODY } from "./notary-core";
import { getTokenQuote, type QuoteInput } from "./quote-core";
import { getTokenInspector, type TokenInspectorInput } from "./token-inspector-core";
import { x402v2 } from "./x402";
import { getHubStats, selfProbe } from "./stats-core";
import { recordCall, snapshot as telemetrySnapshot, TELEMETRY_HEADER } from "./telemetry-core";
import { statusPage } from "./web/status";

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
/*  Status page + telemetry (free, public, no x402)                    */
/* ------------------------------------------------------------------ */

// Human-readable health dashboard. Client-side it pulls /api/status and
// /api/stats. Registered before the /api/* payment middleware so it stays open.
app.get("/status", (c) => {
  const cfg = getConfig(c.env);
  return c.html(statusPage(cfg));
});

// Self-probe: liveness + latency of the hub's own public discovery surface.
app.get("/api/status", async (c) => {
  const cfg = getConfig(c.env);
  const origin = new URL(c.req.url).origin || cfg.siteUrl;
  try {
    const s = await selfProbe(app, c.env, cfg.siteUrl);
    return c.json(s);
  } catch (e) {
    return c.json({ error: "status_probe_failed", message: String(e) }, 500);
  }
});

// On-chain telemetry: payments into payTo, split into external vs test wallet.
app.get("/api/stats", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl || !cfg.payTo) {
    return c.json({ error: "stats_not_configured", hint: "ALCHEMY_BASE_URL or X402_PAY_TO missing" }, 503);
  }
  try {
    const stats = await getHubStats(cfg.alchemyBaseUrl, cfg.payTo, cfg.network);
    return c.json({ ...stats, telemetry: telemetrySnapshot() });
  } catch (e) {
    return c.json({ error: "stats_failed", message: String(e) }, 500);
  }
});

/* ------------------------------------------------------------------ */
/*  Tool pages (HTML, free for humans)                                 */
/* ------------------------------------------------------------------ */

// Registry of tools that have a dedicated client-side page renderer.
// Every tool gets a page — there are no API-only fallbacks left.
const TOOL_PAGES: Record<string, (cfg: ReturnType<typeof getConfig>) => string> = {
  "json-studio": jsonStudioPage,
  "jwt-inspector": jwtInspectorPage,
  "token-counter": tokenCounterPage,
  "web-markdown": webMarkdownPage,
  "url-metadata": urlMetadataPage,
  "regex-mentor": regexMentorPage,
  "encoder-hub": encoderHubPage,
  "diff-pro": diffProPage,
  "time-toolkit": timeToolkitPage,
  "env-studio": envStudioPage,
  "hash-studio": hashStudioPage,
  "color-palette": colorPalettePage,
  "unit-converter": unitConverterPage,
  "git-explainer": gitExplainerPage,
  "meta-tags": metaTagsPage,
  "wallet-intel": walletIntelPage,
  "flight-recorder": flightRecorderPage,
  "agent-passport": agentPassportPage,
  "x402-simulate": x402SimulatePage,
  "merchant-trust": merchantTrustPage,
  "agent-registry": agentRegistryPage,
  "agent-studio": agentStudioPage,
  "base-gas": baseGasPage,
  "agent-intel": agentIntelPage,
  "agent-route": agentRoutePage,
  "402-probe": x402ProbePage,
  "well-known": wellKnownPage,
  "agent-health": agentHealthPage,
  "payment-decoder": paymentDecoderPage,
  "receipt-notary": receiptNotaryPage,
  "token-quote": tokenQuotePage,
  "token-inspector": tokenInspectorPage,
  "address-toolkit": addressToolkitPage,
};

app.get("/tools/:name", (c) => {
  const name = c.req.param("name");
  const tool = TOOLS[name];
  if (!tool) return c.notFound();
  const cfg = getConfig(c.env);

  const renderer = TOOL_PAGES[name];
  if (renderer) return c.html(renderer(cfg));

  // Safety net: unknown tool still renders a minimal, styled page.
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
        description: `x402 paid endpoint: returns 402 with payment requirements; retry with X-PAYMENT after paying $${t.priceUsd} USDC.`,
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: {
          "200": { description: "OK" },
          "402": {
            description: "Payment Required",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
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
  lines.push(`Stats (on-chain): ${cfg.siteUrl}/api/stats`);
  lines.push(`Status (live): ${cfg.siteUrl}/api/status`);
  lines.push("");
  lines.push("## Real paid call (via Coinbase Wallet CLI, awal)");
  lines.push("");
  lines.push("  npx awal x402 pay " + cfg.siteUrl + "/api/web-markdown -X POST -d @body.json");
  lines.push("");
  lines.push("awal signs the exact USDC transfer, base64-encodes the payload,");
  lines.push("and sends it as the X-PAYMENT header. The hub verifies via the");
  lines.push("facilitator and returns the tool result on the first retry.");
  lines.push("");
  lines.push("## Paid example (end-to-end)");
  lines.push("");
  lines.push("1. POST " + cfg.siteUrl + "/api/web-markdown  ->  402 Payment Required");
  lines.push("2. The 402 body + PAYMENT-REQUIRED header carry accepts[]: scheme=exact,");
  lines.push("   network=eip155:8453 (Base), asset=USDC, amount in atomic units, payTo.");
  lines.push("3. Sign the exact-transfer, base64 the payload, retry with header X-PAYMENT: <b64>.");
  lines.push("4. The hub verifies + settles via the facilitator, then returns the tool result.");
  lines.push("");
  lines.push("The receiving address is discoverable ONLY from the 402 response,");
  lines.push("never from this file — by design.");
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

// Canonical agent manifest lives at /.well-known/agent.json. This 301 alias
// serves agents that probe the conventional /agent.json path directly, so
// there is exactly one discovery document and the hub answers on both.
app.get("/agent.json", (c) => c.redirect("/.well-known/agent.json", 301));

/* ------------------------------------------------------------------ */
/*  Free wallet lookup (browser page, no x402)                         */
/* ------------------------------------------------------------------ */

// Free, rate-limited-by-nature endpoint for the Wallet Intel web page.
// It is intentionally NOT present in the x402 TOOLS table, so the payment
// middleware below leaves it open. Returns a basic snapshot only.
app.post("/api/wallet-lookup", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "wallet_lookup_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  try {
    const snapshot = await getWalletSnapshot(cfg.alchemyBaseUrl, address);
    return c.json({ ok: true, snapshot });
  } catch (e) {
    console.error("wallet-lookup error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

/* ------------------------------------------------------------------ */
/*  Free Trust Layer lookups (browser pages, no x402)                  */
/* ------------------------------------------------------------------ */

// Free lookup for the Flight Recorder page. Reads USDC receipts straight
// from Base via Alchemy. Not present in the x402 TOOLS table, so the
// payment middleware below leaves it open to humans.
app.post("/api/flight-recorder/lookup", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  const direction = body.direction === "out" ? "out" : "in";
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
  try {
    const data = await getReceipts(cfg.alchemyBaseUrl, address, direction, limit);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("flight-recorder lookup error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Free lookup for the Agent Passport page. Aggregates outgoing USDC
// payments into a 0-100 Trust Score. Also open to humans.
app.post("/api/agent-passport/lookup", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  try {
    const data = await getPassport(cfg.alchemyBaseUrl, address);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-passport lookup error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Free lookup for the x402 Simulate page. Pure, stateless cost model.
app.post("/api/x402-simulate/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = simulateX402(body);
  return c.json({ ok: true, data: result });
});

// Free lookup for the Merchant Trust page.
app.post("/api/merchant-trust/lookup", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
  try {
    const data = await getMerchantTrust(cfg.alchemyBaseUrl, address, limit);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("merchant-trust lookup error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Free lookup for the Agent Registry page.
app.post("/api/agent-registry/lookup", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const seeds = Array.isArray(body.seeds) ? body.seeds : [];
  const clean = seeds.filter((s: unknown) => isValidEvmAddress(s)).map((s: string) => normalizeAddress(s));
  if (clean.length === 0) {
    return c.json({ error: "seeds (array of 0x + 40 hex addresses) required" }, 400);
  }
  const perSeed = Math.min(Math.max(Number(body.per_seed) || 50, 1), 200);
  try {
    const data = await getAgentRegistry(cfg.alchemyBaseUrl, clean, perSeed);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-registry lookup error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Free lookup for the Agent Studio page. Stateless: builds an agent.json
// manifest, checks hub capabilities and models cost. Optional watch-only
// trust check runs only when the caller supplies a valid 0x address.
app.post("/api/agent-studio/lookup", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const input: AgentInput = {
    name: String(body.name ?? "").slice(0, 80),
    goal: body.goal === undefined ? undefined : String(body.goal).slice(0, 400),
    tools: Array.isArray(body.tools) ? body.tools.filter((x: unknown) => typeof x === "string").slice(0, 64) : [],
    calls_per_month: body.calls_per_month === undefined ? undefined : Number(body.calls_per_month),
    subscription_usd: body.subscription_usd === undefined ? undefined : Number(body.subscription_usd),
    wallet: body.wallet === undefined ? undefined : String(body.wallet),
    network: body.network === undefined ? undefined : String(body.network),
  };
  try {
    const data = await dryRunAgent(input, cfg);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-studio lookup error:", e);
    return c.json({ ok: false, error: "dry_run_failed" }, 502);
  }
});

// Free lookup for the Address Toolkit page.
app.post("/api/address-toolkit/lookup", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const raw = String(body.address ?? "").trim();
  if (!raw) return c.json({ error: "address (0x + 40 hex) required" }, 400);
  try {
    const data = await describeAddress(raw, cfg.alchemyBaseUrl);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("address-toolkit lookup error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Free lookup for the Base Gas page.
app.post("/api/base-gas/lookup", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const ethUsd = body.eth_usd === undefined ? undefined : Number(body.eth_usd);
  const gasLimit = body.gas_limit === undefined ? undefined : Number(body.gas_limit);
  try {
    const gas = await getBaseGas(cfg.alchemyBaseUrl, ethUsd);
    const custom = gasLimit && gas.total_gwei !== null
      ? [{
          gas_limit: gasLimit,
          cost_usd: +(((gas.total_gwei * 1e9 * gasLimit) / 1e18) * (gas.eth_usd || 0)).toFixed(6),
        }]
      : [];
    return c.json({ ok: true, data: { ...gas, custom } });
  } catch (e) {
    console.error("base-gas lookup error:", e);
    return c.json({ ok: false, error: "gas_failed" }, 502);
  }
});

// Free lookup for the Agent Intelligence page. Pipeline: content + registry + passport.
app.post("/api/agent-intel/lookup", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const input: AgentIntelInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
    seed: body.seed === undefined ? undefined : String(body.seed),
    address: body.address === undefined ? undefined : String(body.address),
    per_seed: body.per_seed === undefined ? undefined : Number(body.per_seed),
  };
  try {
    const data = await runAgentIntel(input, cfg.alchemyBaseUrl);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-intel lookup error:", e);
    return c.json({ ok: false, error: "intel_failed" }, 502);
  }
});

// Free lookup for the Agent Route page. Stateless: scores hub tools against a task.
app.post("/api/agent-route/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: RouteInput = {
    task: body.task === undefined ? undefined : String(body.task).slice(0, 400),
    budget_usdc: body.budget_usdc === undefined ? undefined : Number(body.budget_usdc),
    max_steps: body.max_steps === undefined ? undefined : Number(body.max_steps),
    chain: body.chain === undefined ? undefined : String(body.chain),
    mode: body.mode === undefined ? undefined : String(body.mode) as RouteInput["mode"],
    wallet: body.wallet === undefined ? undefined : String(body.wallet),
  };
  const data = routeTask(input);
  return c.json({ ok: true, data });
});

// Free lookup for the 402 Probe page. Stateless: one unpaid request, parse the 402.
app.post("/api/402-probe/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: ProbeInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
    method: body.method === undefined ? undefined : String(body.method),
    body: body.body,
    headers: body.headers && typeof body.headers === "object" ? body.headers : undefined,
    follow: body.follow === undefined ? undefined : Boolean(body.follow),
    timeout_ms: body.timeout_ms === undefined ? undefined : Number(body.timeout_ms),
    mode: body.mode === "describe" ? "describe" : "challenge",
  };
  try {
    const data = await probeEndpoint(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("402-probe lookup error:", e);
    return c.json({ ok: false, error: "probe_failed" }, 502);
  }
});

// Free lookup for the Well-Known Reader page.
app.post("/api/well-known/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: WellKnownInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
  };
  try {
    const data = await readWellKnown(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("well-known lookup error:", e);
    return c.json({ ok: false, error: "wellknown_failed" }, 502);
  }
});

// Free lookup for the Agent Health page. Thin orchestrator over probe + well-known + latency.
app.post("/api/agent-health/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: HealthInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
    method: body.method === undefined ? undefined : String(body.method),
    body: body.body,
    timeout_ms: body.timeout_ms === undefined ? undefined : Number(body.timeout_ms),
  };
  try {
    const data = await runAgentHealth(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-health lookup error:", e);
    return c.json({ ok: false, error: "health_failed" }, 502);
  }
});

// Free lookup for the Payment Decoder page. Pure local parse — no outbound request.
app.post("/api/payment-decoder/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: DecodeInput = {
    payload: body.payload === undefined ? "" : String(body.payload).slice(0, 20000),
  };
  const data = decodePayment(input);
  return c.json({ ok: true, data });
});

// Free lookup for the Receipt Notary page. No outbound payment, no refetch.
app.post("/api/receipt-notary/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: NotaryInput = {
    resource: body.resource === undefined ? undefined : String(body.resource).slice(0, 2000),
    sha256: body.sha256 === undefined ? undefined : String(body.sha256),
    body: body.body === undefined ? undefined : String(body.body),
    payment_tx: body.payment_tx === undefined ? undefined : String(body.payment_tx),
    content_type: body.content_type === undefined ? undefined : String(body.content_type),
  };
  const data = await notarize(input);
  if (data.bytes !== null && data.bytes > MAX_BODY && data.receipt_id === "") {
    return c.json({ ok: false, error: "body_too_large", message: `Body exceeds ${MAX_BODY} bytes — send only a pre-computed sha256.` }, 413);
  }
  return c.json({ ok: true, data });
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
  const res = await x402v2(cfg)(c, next);
  // Telemetry: count only external /api/<tool> calls.
  try {
    const path = new URL(c.req.url).pathname;
    if (/^\/api\/(list|stats|status)$/.test(path)) return res;
    if (c.req.header(TELEMETRY_HEADER) === "1") return res;
    const status = (res && (res as Response).status) || c.res?.status || 0;
    if (status) recordCall(path, status);
  } catch { /* never break the request path */ }
  return res;
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

// Server-side regex tester for agents. Runs the pattern against the text
// with the native RegExp engine and returns matches with groups. Same
// semantics as the browser Regex Mentor page.
app.post("/api/regex-mentor", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const pattern = body.pattern;
  const text = body.text;
  if (typeof pattern !== "string" || !pattern) {
    return c.json({ error: "pattern (string) required" }, 400);
  }
  if (typeof text !== "string") {
    return c.json({ error: "text (string) required" }, 400);
  }

  const rawFlags = typeof body.flags === "string" ? body.flags : "";
  const flags = rawFlags.replace(/[^gimsuy]/g, "");

  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return c.json({ ok: false, error: String((e as Error).message) }, 400);
  }

  const matches: Array<{ value: string; index: number; groups: unknown[]; named: Record<string, string> | null }> = [];
  const snap = (m: RegExpExecArray) => ({
    value: m[0],
    index: m.index,
    groups: m.slice(1),
    named: m.groups ?? null,
  });

  if (!re.global && !re.sticky) {
    const m = re.exec(text);
    if (m) matches.push(snap(m));
  } else {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(text)) !== null) {
      matches.push(snap(m));
      if (m[0] === "") re.lastIndex++;
      if (++guard > 10000) break;
    }
  }

  return c.json({ ok: true, pattern, flags, count: matches.length, matches });
});

// Server-side encoder for agents. Supports base64, base64url, url, html,
// hex, binary and jwt (base64url). Mirrors the browser Encoder Hub page.
app.post("/api/encoder-hub", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const codec = typeof body.codec === "string" ? body.codec : "base64";
  const mode = body.mode === "decode" ? "decode" : "encode";
  const value = body.value;
  if (typeof value !== "string") {
    return c.json({ error: "value (string) required" }, 400);
  }

  const b64Encode = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };
  const b64Decode = (s: string) => {
    const bin = atob(s.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };
  const b64UrlEncode = (s: string) =>
    b64Encode(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64UrlDecode = (s: string) => {
    let t = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    while (t.length % 4) t += "=";
    return b64Decode(t);
  };
  const hexEncode = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const hexDecode = (s: string) => {
    const t = s.replace(/\s+|0x/gi, "");
    if (t.length % 2) throw new Error("hex length must be even");
    const bytes = new Uint8Array(t.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(t.substr(i * 2, 2), 16);
    return new TextDecoder().decode(bytes);
  };
  const binEncode = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    return Array.from(bytes).map((b) => b.toString(2).padStart(8, "0")).join(" ");
  };
  const binDecode = (s: string) => {
    const bits = s.replace(/[^01]/g, "");
    if (bits.length % 8) throw new Error("binary length must be a multiple of 8");
    const bytes = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    return new TextDecoder().decode(bytes);
  };
  const htmlEncode = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const htmlDecode = (s: string) =>
    s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const table: Record<string, { encode: (s: string) => string; decode: (s: string) => string }> = {
    base64: { encode: b64Encode, decode: b64Decode },
    base64url: { encode: b64UrlEncode, decode: b64UrlDecode },
    url: { encode: encodeURIComponent, decode: decodeURIComponent },
    html: { encode: htmlEncode, decode: htmlDecode },
    hex: { encode: hexEncode, decode: hexDecode },
    binary: { encode: binEncode, decode: binDecode },
    jwt: { encode: b64UrlEncode, decode: b64UrlDecode },
  };

  const fn = table[codec] && table[codec][mode];
  if (!fn) return c.json({ error: "unknown codec/mode" }, 400);

  try {
    const result = fn(value);
    return c.json({ ok: true, codec, mode, result, length: result.length });
  } catch (e) {
    return c.json({ ok: false, error: String((e as Error).message) }, 400);
  }
});

// Server-side diff for agents. Mirrors the browser Diff Pro page:
// computes line-level LCS and returns unified diff + stats.
app.post("/api/diff-pro", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const a = body.a;
  const b = body.b;
  if (typeof a !== "string" || typeof b !== "string") {
    return c.json({ error: "a (string) and b (string) required" }, 400);
  }

  const ignoreWs = body.ignoreWhitespace === true;
  const ignoreCase = body.ignoreCase === true;

  const rawA: string[] = a.split("\n");
  const rawB: string[] = b.split("\n");
  const norm = (line: string) => {
    let t = line;
    if (ignoreWs) t = t.replace(/\s+/g, " ").trim();
    if (ignoreCase) t = t.toLowerCase();
    return t;
  };
  const A: string[] = rawA.map(norm);
  const B: string[] = rawB.map(norm);

  const n = A.length, m = B.length;
  const dp: Int32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  type Op = { type: "keep" | "del" | "ins"; a: number; b: number };
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ type: "keep", a: i, b: j }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { ops.push({ type: "del", a: i, b: -1 }); i++; }
    else { ops.push({ type: "ins", a: -1, b: j }); j++; }
  }
  while (i < n) { ops.push({ type: "del", a: i, b: -1 }); i++; }
  while (j < m) { ops.push({ type: "ins", a: -1, b: j }); j++; }

  let added = 0, removed = 0, unchanged = 0;
  for (const op of ops) {
    if (op.type === "ins") added++;
    else if (op.type === "del") removed++;
    else unchanged++;
  }

  // Build unified diff with ±3 context lines (git-style).
  const ctx = 3;
  const hunks: Op[][] = [];
  let cur: Op[] | null = null;
  let startK = 0;
  let sinceChange = 1e9;
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (!op) continue;
    const changed = op.type !== "keep";
    if (changed) {
      if (!cur) {
        startK = Math.max(0, k - ctx);
        cur = [];
      }
      while (cur.length + startK < k) {
        const fill = ops[startK + cur.length];
        if (!fill) break;
        cur.push(fill);
      }
      cur.push(op);
      sinceChange = 0;
    } else if (cur) {
      sinceChange++;
      if (sinceChange <= ctx) cur.push(op);
      else { hunks.push(cur); cur = null; sinceChange = 1e9; }
    }
  }
  if (cur) hunks.push(cur);

  const unifiedLines: string[] = [];
  for (const hunk of hunks) {
    let aStart = 1, aCount = 0, bStart = 1, bCount = 0;
    let firstA = true, firstB = true;
    for (const op of hunk) {
      if (op.a >= 0) { if (firstA) { aStart = op.a + 1; firstA = false; } aCount++; }
      if (op.b >= 0) { if (firstB) { bStart = op.b + 1; firstB = false; } bCount++; }
    }
    unifiedLines.push("@@ -" + aStart + "," + aCount + " +" + bStart + "," + bCount + " @@");
    for (const op of hunk) {
      if (op.type === "keep") unifiedLines.push(" " + (rawA[op.a] ?? ""));
      else if (op.type === "del") unifiedLines.push("-" + (rawA[op.a] ?? ""));
      else unifiedLines.push("+" + (rawB[op.b] ?? ""));
    }
  }

  const unified = unifiedLines.join("\n") || "(no differences)";

  return c.json({
    ok: true,
    stats: { added, removed, unchanged, hunks: hunks.length },
    unified,
  });
});

// Server-side Time Toolkit for agents. Parses unix seconds/ms, ISO 8601,
// RFC 2822 and simple relative expressions; converts into a target time zone.
// Mirrors the browser Time Toolkit page.
app.post("/api/time-toolkit", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = body.input ?? body.value ?? body.date;
  if (input === undefined || input === null) {
    return c.json({ error: "input required (unix seconds/ms, ISO 8601, or relative like 'in 2 days')" }, 400);
  }

  const now = new Date();
  let d: Date | null = null;
  const unitMap: Record<string, number> = {
    second: 1000, minute: 60000, hour: 3600000,
    day: 86400000, week: 604800000, month: 2592000000, year: 31536000000,
  };

  if (typeof input === "number") {
    d = new Date(input < 1e12 ? input * 1000 : input);
  } else if (typeof input === "string") {
    const str = input.trim();
    let m: RegExpMatchArray | null = null;
    if (/^[0-9]+$/.test(str)) {
      const n = Number(str);
      d = new Date(n < 1e12 ? n * 1000 : n);
    } else if ((m = str.match(/^(?:in +)?([0-9]+) +(second|minute|hour|day|week|month|year)s?(?: +(?:from now|ahead))?$/i))) {
      d = new Date(now.getTime() + Number(m[1]) * unitMap[m[2]!.toLowerCase()]!);
    } else if ((m = str.match(/^([0-9]+) +(second|minute|hour|day|week|month|year)s? +ago$/i))) {
      d = new Date(now.getTime() - Number(m[1]) * unitMap[m[2]!.toLowerCase()]!);
    } else {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }

  if (!d || isNaN(d.getTime())) {
    return c.json({ ok: false, error: "cannot parse input" }, 400);
  }

  const tz = typeof body.timezone === "string" ? body.timezone : "UTC";
  let local: string | null = null;
  try {
    local = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(d);
  } catch {
    local = null;
  }

  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000000], ["month", 2592000000], ["day", 86400000],
    ["hour", 3600000], ["minute", 60000], ["second", 1000],
  ];
  let relative = "now";
  for (const [u, ms] of units) {
    if (abs >= ms || u === "second") {
      relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(diff / ms), u);
      break;
    }
  }

  return c.json({
    ok: true,
    input,
    iso: d.toISOString(),
    unix: Math.floor(d.getTime() / 1000),
    unix_ms: d.getTime(),
    utc: d.toUTCString(),
    timezone: tz,
    local,
    relative,
  });
});

// Server-side Env Studio for agents. Parses .env text into key/value pairs,
// reports duplicates and returns the requested representation. Mirrors the
// browser Env Studio page.
app.post("/api/env-studio", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = body.env ?? body.text ?? body.value;
  if (typeof text !== "string") {
    return c.json({ error: "env (string) required" }, 400);
  }
  const format = typeof body.format === "string" ? body.format : "json";

  const pairs: Array<{ key: string; value: string; duplicate: boolean }> = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const q = value.charAt(0);
    if (q === '"' || q === "'") {
      const end = value.indexOf(q, 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    const duplicate = seen.has(key);
    seen.add(key);
    pairs.push({ key, value, duplicate });
  }

  const obj: Record<string, string> = {};
  for (const p of pairs) obj[p.key] = p.value;

  let result: string;
  if (format === "yaml") {
    result = pairs
      .map((p) => p.key + ": " + (/[:#\-{}\[\],&*!|>'"%@`]/.test(p.value) || p.value === "" ? JSON.stringify(p.value) : p.value))
      .join("\n");
  } else if (format === "docker") {
    result = "services:\n  app:\n    environment:\n" + pairs.map((p) => "      - " + p.key + "=" + p.value).join("\n");
  } else if (format === "shell") {
    result = pairs.map((p) => "export " + p.key + "=" + JSON.stringify(p.value)).join("\n");
  } else {
    result = JSON.stringify(obj, null, 2);
  }

  return c.json({ ok: true, format, count: pairs.length, pairs, result });
});

// Server-side Hash Studio for agents. Returns hex digests for the
// requested algorithms. MD5 is not available in WebCrypto (Workers
// too), so only SHA family is served here. Mirrors the browser page.
app.post("/api/hash-studio", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = body.text ?? body.value;
  if (typeof text !== "string") {
    return c.json({ error: "text (string) required" }, 400);
  }
  const wanted = Array.isArray(body.algorithms) && body.algorithms.length
    ? body.algorithms
    : ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
  const allowed = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
  const algos = wanted.filter((a: unknown) => typeof a === "string" && allowed.includes(a));
  if (!algos.length) {
    return c.json({ error: "no supported algorithms requested", allowed }, 400);
  }

  const data = new TextEncoder().encode(text);
  const result: Record<string, string> = {};
  for (const alg of algos) {
    const buf = await crypto.subtle.digest(alg, data);
    result[alg] = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return c.json({ ok: true, length: text.length, hashes: result, note: "MD5 not available server-side" });
});

// Server-side Color Palette for agents. Computes a 10-step shade ramp
// from a base color and reports WCAG contrast against white and black.
// Mirrors the browser Color Palette Studio page.
app.post("/api/color-palette", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const hex = typeof body.hex === "string" ? body.hex : "#10e0a0";
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) {
    return c.json({ error: "hex must be a #rrggbb string" }, 400);
  }
  const base = {
    r: parseInt(m[1]!.slice(0, 2), 16),
    g: parseInt(m[1]!.slice(2, 4), 16),
    b: parseInt(m[1]!.slice(4, 6), 16),
  };
  const toHex = (c: { r: number; g: number; b: number }) =>
    "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const mix = (a: typeof base, b: typeof base, t: number) => ({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });
  const shades = [
    ["50",  mix(base, { r: 255, g: 255, b: 255 }, 0.92)],
    ["100", mix(base, { r: 255, g: 255, b: 255 }, 0.80)],
    ["200", mix(base, { r: 255, g: 255, b: 255 }, 0.60)],
    ["300", mix(base, { r: 255, g: 255, b: 255 }, 0.35)],
    ["400", mix(base, { r: 255, g: 255, b: 255 }, 0.10)],
    ["500", base],
    ["600", mix(base, { r: 0, g: 0, b: 0 }, 0.15)],
    ["700", mix(base, { r: 0, g: 0, b: 0 }, 0.30)],
    ["800", mix(base, { r: 0, g: 0, b: 0 }, 0.55)],
    ["900", mix(base, { r: 0, g: 0, b: 0 }, 0.75)],
  ];
  const palette = shades.map(([name, col]) => ({ name, hex: toHex(col as typeof base) }));

  const lum = (c: typeof base) => {
    const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const ratio = (a: typeof base, b: typeof base) => {
    const la = lum(a), lb = lum(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
  };
  const onWhite = ratio(base, { r: 255, g: 255, b: 255 });
  const onBlack = ratio(base, { r: 0, g: 0, b: 0 });

  return c.json({
    ok: true,
    base: toHex(base),
    palette,
    contrast: {
      on_white: onWhite, on_white_aa: onWhite >= 4.5, on_white_aaa: onWhite >= 7,
      on_black: onBlack, on_black_aa: onBlack >= 4.5, on_black_aaa: onBlack >= 7,
    },
  });
});

// Server-side Unit Converter for agents. Length/weight/volume/area/speed/data
// via factors; temperature via offsets. Mirrors the browser page.
const _UC_FACTORS: Record<string, Record<string, number>> = {
  length: { nm: 1e-9, um: 1e-6, mm: 1e-3, cm: 1e-2, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852 },
  weight: { ug: 1e-9, mg: 1e-6, g: 1e-3, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 },
  volume: { ml: 1e-3, l: 1, m3: 1000, tsp: 0.00492892159375, tbsp: 0.01478676478125, floz: 0.0295735295625, cup: 0.2365882365, pt: 0.473176473, qt: 0.946352946, gal: 3.785411784, gal_uk: 4.54609 },
  area: { mm2: 1e-6, cm2: 1e-4, m2: 1, km2: 1e6, in2: 0.00064516, ft2: 0.09290304, yd2: 0.83612736, acre: 4046.8564224, ha: 10000 },
  speed: { ms: 1, kmh: 1/3.6, mph: 0.44704, knot: 0.514444444, fts: 0.3048, mach: 340.29 },
  data: { bit: 0.125, byte: 1, kb: 1e3, kib: 1024, mb: 1e6, mib: 1048576, gb: 1e9, gib: 1073741824, tb: 1e12, tib: 1099511627776 },
};
app.post("/api/unit-converter", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const category = typeof body.category === "string" ? body.category : "length";
  const from = typeof body.from === "string" ? body.from : "";
  const to = typeof body.to === "string" ? body.to : "";
  const value = typeof body.value === "number" ? body.value : Number(body.value);
  if (!isFinite(value) || !from || !to) {
    return c.json({ error: "value (number), from (string) and to (string) required" }, 400);
  }
  let result: number | null = null;
  if (category === "temperature") {
    const toC = (v: number, u: string) => u === "celsius" ? v : u === "fahrenheit" ? (v - 32) * 5 / 9 : u === "kelvin" ? v - 273.15 : NaN;
    const fromC = (v: number, u: string) => u === "celsius" ? v : u === "fahrenheit" ? v * 9 / 5 + 32 : u === "kelvin" ? v + 273.15 : NaN;
    result = fromC(toC(value, from), to);
  } else {
    const tbl = _UC_FACTORS[category];
    if (!tbl || tbl[from] === undefined || tbl[to] === undefined) {
      return c.json({ error: "unknown category or unit", category, from, to }, 400);
    }
    result = value * tbl[from]! / tbl[to]!;
  }
  if (result === null || !isFinite(result)) {
    return c.json({ error: "cannot convert" }, 400);
  }
  return c.json({ ok: true, category, from, to, value, result });
});

// Server-side Git Explainer for agents. NOTE: the full dictionary lives in the
// browser page; the API accepts the input and echoes it with a hint.
app.post("/api/git-explainer", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  if (!text) {
    return c.json({ error: "text (string) required" }, 400);
  }
  const results = explainGit(text);
  return c.json({
    ok: true,
    input: text,
    count: results.length,
    matched: results.filter((r) => r.matched).length,
    results,
  });
});

// Server-side Meta Tags generator for agents. Builds SEO + OpenGraph +
// Twitter Card tags from a title/description/url/image tuple.
app.post("/api/meta-tags", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : "";
  const desc = typeof body.description === "string" ? body.description : "";
  const url = typeof body.url === "string" ? body.url : "";
  const image = typeof body.image === "string" ? body.image : "";
  const type = typeof body.type === "string" ? body.type : "website";
  const twitter = typeof body.twitterCard === "string" ? body.twitterCard : "summary_large_image";
  if (!title) {
    return c.json({ error: "title (string) required" }, 400);
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const lines: string[] = [];
  lines.push(`<title>${esc(title)}</title>`);
  if (desc) lines.push(`<meta name="description" content="${esc(desc)}">`);
  if (url) lines.push(`<link rel="canonical" href="${esc(url)}">`);
  lines.push(`<meta property="og:title" content="${esc(title)}">`);
  if (desc) lines.push(`<meta property="og:description" content="${esc(desc)}">`);
  lines.push(`<meta property="og:type" content="${esc(type)}">`);
  if (url) lines.push(`<meta property="og:url" content="${esc(url)}">`);
  if (image) lines.push(`<meta property="og:image" content="${esc(image)}">`);
  lines.push(`<meta name="twitter:card" content="${esc(twitter)}">`);
  lines.push(`<meta name="twitter:title" content="${esc(title)}">`);
  if (desc) lines.push(`<meta name="twitter:description" content="${esc(desc)}">`);
  if (image) lines.push(`<meta name="twitter:image" content="${esc(image)}">`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description: desc,
    ...(url ? { url } : {}),
    ...(image ? { image } : {}),
  };
  return c.json({ ok: true, html: lines.join("\n"), jsonLd });
});

// Paid, x402-protected deep tier: full wallet intel incl. history,
// funding sources and a heuristic risk score.
app.post("/api/wallet-intel", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "wallet_intel_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  try {
    const intel = await getWalletIntel(cfg.alchemyBaseUrl, address);
    return c.json({ ok: true, intel });
  } catch (e) {
    console.error("wallet-intel error:", e);
    return c.json({ ok: false, error: "intel_failed" }, 502);
  }
});

/* ------------------------------------------------------------------ */
/*  Trust Layer — paid API (x402-protected, for agents)                */
/* ------------------------------------------------------------------ */

// Paid tier: raw USDC receipts for any address on Base.
// POST { "address": "0x…", "direction": "in"|"out", "limit": 50 }
app.post("/api/flight-recorder", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  const direction = body.direction === "out" ? "out" : "in";
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
  try {
    const receipts = await getReceipts(cfg.alchemyBaseUrl, address, direction, limit);
    return c.json({ ok: true, receipts });
  } catch (e) {
    console.error("flight-recorder error:", e);
    return c.json({ ok: false, error: "receipts_failed" }, 502);
  }
});

// Paid tier: Agent Passport — reputation + Trust Score for a payer wallet.
// POST { "address": "0x…" }
app.post("/api/agent-passport", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  try {
    const passport = await getPassport(cfg.alchemyBaseUrl, address);
    return c.json({ ok: true, passport });
  } catch (e) {
    console.error("agent-passport error:", e);
    return c.json({ ok: false, error: "passport_failed" }, 502);
  }
});

// Paid tier: Agent Studio — same payload as the free lookup, x402-protected.
// POST { name, goal?, tools[], calls_per_month?, subscription_usd?, wallet? }
app.post("/api/agent-studio", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const input: AgentInput = {
    name: String(body.name ?? "").slice(0, 80),
    goal: body.goal === undefined ? undefined : String(body.goal).slice(0, 400),
    tools: Array.isArray(body.tools) ? body.tools.filter((x: unknown) => typeof x === "string").slice(0, 64) : [],
    calls_per_month: body.calls_per_month === undefined ? undefined : Number(body.calls_per_month),
    subscription_usd: body.subscription_usd === undefined ? undefined : Number(body.subscription_usd),
    wallet: body.wallet === undefined ? undefined : String(body.wallet),
    network: body.network === undefined ? undefined : String(body.network),
  };
  try {
    const data = await dryRunAgent(input, cfg);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-studio error:", e);
    return c.json({ ok: false, error: "dry_run_failed" }, 502);
  }
});

// Paid tier: x402 Simulate — same payload as the free lookup, x402-protected.
app.post("/api/x402-simulate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = simulateX402(body);
  return c.json({ ok: true, data: result });
});

// Paid tier: Merchant Trust — reputation for a receiving wallet.
// POST { "address": "0x…", "limit"?: 200 }
app.post("/api/merchant-trust", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = body.address;
  if (!isValidEvmAddress(raw)) {
    return c.json({ error: "address (0x + 40 hex) required" }, 400);
  }
  const address = normalizeAddress(raw);
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
  try {
    const data = await getMerchantTrust(cfg.alchemyBaseUrl, address, limit);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("merchant-trust error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Paid tier: Agent Registry — live directory from seed wallets.
// POST { "seeds": ["0x…"], "per_seed"?: 50 }
app.post("/api/agent-registry", async (c) => {
  const cfg = getConfig(c.env);
  if (!cfg.alchemyBaseUrl) {
    return c.json({ error: "trust_layer_not_configured", hint: "ALCHEMY_BASE_URL secret is missing" }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const seeds = Array.isArray(body.seeds) ? body.seeds : [];
  const clean = seeds.filter((s: unknown) => isValidEvmAddress(s)).map((s: string) => normalizeAddress(s));
  if (clean.length === 0) {
    return c.json({ error: "seeds (array of 0x + 40 hex addresses) required" }, 400);
  }
  const perSeed = Math.min(Math.max(Number(body.per_seed) || 50, 1), 200);
  try {
    const data = await getAgentRegistry(cfg.alchemyBaseUrl, clean, perSeed);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-registry error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Paid tier: Address Toolkit.
// POST { "address": "0x…" }
app.post("/api/address-toolkit", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const raw = String(body.address ?? "").trim();
  if (!raw) return c.json({ error: "address (0x + 40 hex) required" }, 400);
  try {
    const data = await describeAddress(raw, cfg.alchemyBaseUrl);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("address-toolkit error:", e);
    return c.json({ ok: false, error: "lookup_failed" }, 502);
  }
});

// Paid tier: Base Gas.
// POST { "gas_limit"?, "eth_usd"? }
app.post("/api/base-gas", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const ethUsd = body.eth_usd === undefined ? undefined : Number(body.eth_usd);
  try {
    const gas = await getBaseGas(cfg.alchemyBaseUrl, ethUsd);
    return c.json({ ok: true, gas });
  } catch (e) {
    console.error("base-gas error:", e);
    return c.json({ ok: false, error: "gas_failed" }, 502);
  }
});

// Paid tier: Agent Intelligence — same payload as the free lookup, x402-protected.
// POST { "url"?, "seed"?, "address"?, "per_seed"? }
app.post("/api/agent-intel", async (c) => {
  const cfg = getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const input: AgentIntelInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
    seed: body.seed === undefined ? undefined : String(body.seed),
    address: body.address === undefined ? undefined : String(body.address),
    per_seed: body.per_seed === undefined ? undefined : Number(body.per_seed),
  };
  try {
    const data = await runAgentIntel(input, cfg.alchemyBaseUrl);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-intel error:", e);
    return c.json({ ok: false, error: "intel_failed" }, 502);
  }
});

// Paid tier: Agent Route — same payload as the free lookup, x402-protected.
// POST { "task", "budget_usdc"?, "max_steps"?, "mode"?, "wallet"? }
app.post("/api/agent-route", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: RouteInput = {
    task: body.task === undefined ? undefined : String(body.task).slice(0, 400),
    budget_usdc: body.budget_usdc === undefined ? undefined : Number(body.budget_usdc),
    max_steps: body.max_steps === undefined ? undefined : Number(body.max_steps),
    chain: body.chain === undefined ? undefined : String(body.chain),
    mode: body.mode === undefined ? undefined : String(body.mode) as RouteInput["mode"],
    wallet: body.wallet === undefined ? undefined : String(body.wallet),
  };
  const data = routeTask(input);
  return c.json({ ok: true, data });
});

// Paid tier: 402 Probe — same payload as the free lookup, x402-protected.
// POST { "url", "method"?, "body"?, "headers"?, "follow"?, "timeout_ms"?, "mode"? }
app.post("/api/402-probe", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: ProbeInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
    method: body.method === undefined ? undefined : String(body.method),
    body: body.body,
    headers: body.headers && typeof body.headers === "object" ? body.headers : undefined,
    follow: body.follow === undefined ? undefined : Boolean(body.follow),
    timeout_ms: body.timeout_ms === undefined ? undefined : Number(body.timeout_ms),
    mode: body.mode === "describe" ? "describe" : "challenge",
  };
  try {
    const data = await probeEndpoint(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("402-probe error:", e);
    return c.json({ ok: false, error: "probe_failed" }, 502);
  }
});

// Paid tier: Well-Known Reader.
// POST { "origin": "https://host" }
app.post("/api/well-known", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: WellKnownInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
  };
  try {
    const data = await readWellKnown(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("well-known error:", e);
    return c.json({ ok: false, error: "wellknown_failed" }, 502);
  }
});

// Paid tier: Agent Health — same payload as the free lookup, x402-protected.
// POST { "url", "method"?, "body"?, "timeout_ms"? }
app.post("/api/agent-health", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: HealthInput = {
    url: body.url === undefined ? "" : String(body.url).slice(0, 2000),
    method: body.method === undefined ? undefined : String(body.method),
    body: body.body,
    timeout_ms: body.timeout_ms === undefined ? undefined : Number(body.timeout_ms),
  };
  try {
    const data = await runAgentHealth(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("agent-health error:", e);
    return c.json({ ok: false, error: "health_failed" }, 502);
  }
});

// Paid tier: Payment Decoder — same payload as the free lookup, x402-protected.
// POST { "payload": "<PAYMENT-REQUIRED header or 402 body>" }
app.post("/api/payment-decoder", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: DecodeInput = {
    payload: body.payload === undefined ? "" : String(body.payload).slice(0, 20000),
  };
  const data = decodePayment(input);
  return c.json({ ok: true, data });
});

// Paid tier: Receipt Notary — same payload as the free lookup, x402-protected.
// POST { "resource"?, "sha256"?, "body"?, "payment_tx"?, "content_type"? }
app.post("/api/receipt-notary", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: NotaryInput = {
    resource: body.resource === undefined ? undefined : String(body.resource).slice(0, 2000),
    sha256: body.sha256 === undefined ? undefined : String(body.sha256),
    body: body.body === undefined ? undefined : String(body.body),
    payment_tx: body.payment_tx === undefined ? undefined : String(body.payment_tx),
    content_type: body.content_type === undefined ? undefined : String(body.content_type),
  };
  const data = await notarize(input);
  if (data.bytes !== null && data.bytes > MAX_BODY && data.receipt_id === "") {
    return c.json({ ok: false, error: "body_too_large", message: `Body exceeds ${MAX_BODY} bytes — send only a pre-computed sha256.` }, 413);
  }
  return c.json({ ok: true, data });
});

// Free lookup for the Token Quote page. Single source, fact-only.
app.post("/api/token-quote/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: QuoteInput = {
    id: body.id === undefined ? "" : String(body.id).slice(0, 120),
    vs: body.vs === undefined ? undefined : String(body.vs).slice(0, 8),
  };
  try {
    const data = await getTokenQuote(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("token-quote lookup error:", e);
    return c.json({ ok: false, error: "quote_failed" }, 502);
  }
});

// Paid tier: Token Quote — same payload as the free lookup, x402-protected.
// POST { "id": "ETH"|"0x…", "vs"?: "USD" }
app.post("/api/token-quote", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: QuoteInput = {
    id: body.id === undefined ? "" : String(body.id).slice(0, 120),
    vs: body.vs === undefined ? undefined : String(body.vs).slice(0, 8),
  };
  try {
    const data = await getTokenQuote(input);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("token-quote error:", e);
    return c.json({ ok: false, error: "quote_failed" }, 502);
  }
});

// Free lookup for the Token Inspector page. Base-only, fact-only.
app.post("/api/token-inspector/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: TokenInspectorInput = {
    address: body.address === undefined ? "" : String(body.address).slice(0, 42),
    chain: body.chain === undefined ? undefined : String(body.chain).slice(0, 16),
  };
  const cfg = getConfig(c.env);
  try {
    const data = await getTokenInspector(input, cfg.alchemyBaseUrl);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("token-inspector lookup error:", e);
    return c.json({ ok: false, error: "inspect_failed" }, 502);
  }
});

// Paid tier: Token Inspector — same payload as the free lookup, x402-protected.
// POST { "address": "0x…", "chain"?: "base" }
app.post("/api/token-inspector", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input: TokenInspectorInput = {
    address: body.address === undefined ? "" : String(body.address).slice(0, 42),
    chain: body.chain === undefined ? undefined : String(body.chain).slice(0, 16),
  };
  const cfg = getConfig(c.env);
  try {
    const data = await getTokenInspector(input, cfg.alchemyBaseUrl);
    return c.json({ ok: true, data });
  } catch (e) {
    console.error("token-inspector error:", e);
    return c.json({ ok: false, error: "inspect_failed" }, 502);
  }
});

/* ------------------------------------------------------------------ */
/*  404 + errors                                                       */
/* ------------------------------------------------------------------ */

app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));

/* ------------------------------------------------------------------ */
/*  SEO: robots.txt + sitemap.xml                                      */
/* ------------------------------------------------------------------ */

app.get("/robots.txt", (c) => {
  const cfg = getConfig(c.env);
  const host = cfg.siteUrl.replace(/^https?:\/\//, "");
  return c.body(
    [
      "User-agent: *",
      "Allow: /",
      "",
      `Host: ${host}`,
      `Sitemap: ${cfg.siteUrl}/sitemap.xml`,
      "",
    ].join("\n"),
    200,
    { "Content-Type": "text/plain; charset=utf-8" }
  );
});

app.get("/sitemap.xml", (c) => {
  const cfg = getConfig(c.env);
  const today = new Date().toISOString().slice(0, 10);
  const tools = Object.keys(TOOLS)
    .map(
      (name) =>
        `  <url><loc>${cfg.siteUrl}/tools/${name}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
    )
    .join("\n");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${cfg.siteUrl}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n` +
    tools +
    `\n</urlset>\n`;
  return c.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

/* ------------------------------------------------------------------ */
/*  Bazaar discovery: machine-readable catalog for x402 directories    */
/* ------------------------------------------------------------------ */

// /.well-known/x402-discovery — Bazaar-compatible discovery metadata.
// Lets crawlers (x402-list, x402.direct, x402Scout, 402index, Bazaar)
// find the hub without CDP/Coinbase keys.
// Domain verification for 402index.io — serves the public verification hash
// so the directory can approve all hub services instantly.
app.get("/.well-known/402index-verify.txt", (c) =>
  c.body("1f4e4431ad415418364b222d10071bb8f34fc55d0e57f588ccef9374bc731078", 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  })
);

// Bazaar/x402 manifest — machine-readable list of every paid resource.
// This is what crawlers check BEFORE hitting individual endpoints.
app.get("/.well-known/x402", (c) => {
  const cfg = getConfig(c.env);
  const siteUrl = cfg.siteUrl;
  const acc = {
    scheme: "exact",
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: cfg.payTo ?? "",
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" },
  };
  return c.json({
    x402Version: 2,
    provider: {
      name: cfg.siteName,
      website: siteUrl,
      docsUrl: `${siteUrl}/openapi.json`,
      description: "Paid tools hub for AI agents. Free web tools for humans.",
      category: "INFRASTRUCTURE",
      tags: ["x402", "tools", "developer", "crypto", "ai-agents", "web"],
    },
    resources: Object.entries(TOOLS).map(([name, t]) => ({
      name,
      resource: `${siteUrl}${t.path}`,
      type: "http",
      x402Version: 2,
      method: "POST",
      description: t.description,
      mimeType: "application/json",
      accepts: [{ ...acc, amount: Math.round(t.priceUsd * 1_000_000).toString() }],
      metadata: {
        provider: { name: cfg.siteName, category: "INFRASTRUCTURE" },
        path: t.path,
        method: "POST",
        description: t.description,
        mimeType: "application/json",
        input: { type: "object", properties: {} },
        output: { type: "object" },
        supportsVanillax402: true,
        supportsCircleGateway: false,
        siwx: false,
      },
    })),
  });
});

app.get("/.well-known/x402-discovery", (c) => {
  const cfg = getConfig(c.env);
  const siteUrl = cfg.siteUrl;
  return c.json({
    x402Version: 2,
    provider: {
      name: cfg.siteName,
      website: siteUrl,
      docsUrl: `${siteUrl}/openapi.json`,
      description: "Paid tools hub for AI agents. Free web tools for humans.",
      category: "INFRASTRUCTURE",
      tags: ["x402", "tools", "developer", "crypto", "ai-agents", "web"],
    },
    resources: Object.entries(TOOLS).map(([name, t]) => ({
      name,
      path: t.path,
      method: "POST",
      description: t.description,
      priceUsd: t.priceUsd,
      free_for_humans: t.freeForHumans,
      network: cfg.network,
      mimeType: "application/json",
      url: `${siteUrl}${t.path}`,
    })),
  });
});

// /discovery/resources — Bazaar-style discovery endpoint (same shape as
// facilitator catalogs), so any Bazaar-compatible client can page it.
app.get("/discovery/resources", (c) => {
  const cfg = getConfig(c.env);
  const siteUrl = cfg.siteUrl;
  const acc = {
    scheme: "exact",
    network: "eip155:8453",
    amount: (priceUsd: number) => Math.round(priceUsd * 1_000_000).toString(),
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: cfg.payTo ?? "",
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" },
  };
  return c.json({
    x402Version: 2,
    items: Object.entries(TOOLS).map(([name, t]) => ({
      resource: `${siteUrl}${t.path}`,
      type: "http",
      x402Version: 2,
      accepts: [{ ...acc, amount: Math.round(t.priceUsd * 1_000_000).toString() }],
      metadata: {
        provider: { name: cfg.siteName, category: "INFRASTRUCTURE" },
        path: t.path,
        method: "POST",
        description: t.description,
        mimeType: "application/json",
        input: { type: "object", properties: {} },
        output: { type: "object" },
        supportsVanillax402: true,
        supportsCircleGateway: false,
        siwx: false,
      },
    })),
  });
});

app.notFound((c) =>
  c.html(
    `<!DOCTYPE html><html lang="en"><head>` +
      `<meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex,follow">` +
      `<title>404 — Page not found | x402 Tools Hub</title>` +
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
