/**
 * x402 Tools Hub — developer documentation page (/docs)
 * Premium, human-readable reference for the full tool catalog.
 *
 * Generated from TOOLS + CATEGORY_ORDER/CATEGORY_LABELS so the catalog always
 * stays in sync with the live config (33 tools). Each tool is a LIST ROW:
 * number, name, description, per-call price, endpoint, example request and
 * example response (collapsible). Clean, scannable, developer-first.
 *
 * SEO: TechArticle + BreadcrumbList + ItemList JSON-LD, meta robots, canonical.
 */

import {
  TOOLS,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type AppConfig,
  type ToolCategory,
} from "../config";
import { humanName, jsonLdScript } from "./landing";

/** Escape HTML special characters in interpolated strings. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Money formatting: 0.0005 -> $0.0005. */
function usd(v: number): string {
  return "$" + String(v);
}

/**
 * Curated request/response examples per tool (the ones we actually tested or
 * that follow the documented contract).
 */
const EXAMPLES: Record<string, { req: string; res?: string }> = {
  "token-inspector": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/token-inspector \\
  -d '{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","chain":"base"}'`,
    res: `{
  "ok": true,
  "data": {
    "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "valid": true,
    "is_contract": true,
    "standard": "ERC-20",
    "name": "USD Coin",
    "symbol": "USDC",
    "decimals": 6,
    "total_supply": "4337520850729556",
    "owner": "0x3abd6f64a422225e61e435bae41db12096106df7",
    "source": "alchemy"
  }
}`,
  },
  "token-quote": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/token-quote \\
  -d '{"id":"ETH","vs":"USD"}'`,
    res: `{
  "ok": true,
  "data": {
    "id": "ETH",
    "vs": "USD",
    "price": 2800.42,
    "change_24h": 1.24,
    "source": "binance",
    "as_of": "2026-09-25T21:13:52.160Z"
  }
}`,
  },
  "wallet-intel": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/wallet-intel \\
  -d '{"address":"0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103"}'`,
    res: `{
  "ok": true,
  "intel": {
    "address": "0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103",
    "network": "base",
    "eth_balance": "0.000041",
    "token_count": 4,
    "tokens": [
      { "symbol": "DONALD", "balance": "19.96" },
      { "symbol": "USDC", "balance": "0.147068" }
    ],
    "risk": { "score": 70, "level": "high" }
  }
}`,
  },
  "agent-passport": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/agent-passport \\
  -d '{"address":"0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103"}'`,
    res: `{
  "ok": true,
  "passport": {
    "address": "0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103",
    "wallet_age_days": 76,
    "total_paid_usd": 1.00868,
    "tx_count": 116,
    "merchants_count": 4,
    "trust_score": 60,
    "tier": "gold"
  }
}`,
  },
  "base-gas": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/base-gas -d '{}'`,
    res: `{
  "ok": true,
  "gas": {
    "base_fee_gwei": 0.006,
    "priority_fee_gwei": 0.02,
    "total_gwei": 0.006,
    "transfer_cost_usd": 0.000353,
    "call_cost_usd": 0.001512,
    "eth_usd": 2800,
    "block_number": 51790747
  }
}`,
  },
  "address-toolkit": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/address-toolkit \\
  -d '{"address":"0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103"}'`,
    res: `{
  "ok": true,
  "data": {
    "input": "0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103",
    "valid": true,
    "address": "0x998da3d1f0b6f510cd629bf26e7aeca08f4ca103",
    "checksum": "0x998da3D1F0b6F510cd629bF26e7aECa08f4CA103",
    "type": "contract"
  }
}`,
  },
  "flight-recorder": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/flight-recorder \\
  -d '{"address":"0x5b7efd37546d6bb02463339ceaddd80997ac97b3","direction":"in","limit":20}'`,
    res: `{
  "ok": true,
  "data": {
    "address": "0x5b7efd37546d6bb02463339ceaddd80997ac97b3",
    "direction": "in",
    "total_received_usd": 6.6965,
    "transfers": [
      { "from": "0x998d...", "value": 0.001, "asset": "USDC", "at": "2026-09-25T21:14:03Z" }
    ]
  }
}`,
  },
  "merchant-trust": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/merchant-trust \\
  -d '{"address":"0x5b7efd37546d6bb02463339ceaddd80997ac97b3"}'`,
    res: `{
  "ok": true,
  "merchant": {
    "address": "0x5b7efd37546d6bb02463339ceaddd80997ac97b3",
    "total_received_usd": 6.7,
    "distinct_payers": 5,
    "concentration_risk": "low",
    "trust_score": 82
  }
}`,
  },
  "agent-registry": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/agent-registry \\
  -d '{"seed":"0x5b7efd37546d6bb02463339ceaddd80997ac97b3","hops":1}'`,
    res: `{
  "ok": true,
  "registry": {
    "seed": "0x5b7efd...",
    "hops": 1,
    "agents": [
      { "address": "0x998d...", "payments": 116 },
      { "address": "0x1165...", "payments": 64 }
    ]
  }
}`,
  },
  "402-probe": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/402-probe \\
  -d '{"url":"https://example.com/api/foo"}'`,
    res: `{
  "ok": true,
  "probe": {
    "url": "https://example.com/api/foo",
    "is_x402": true,
    "payment_terms": {
      "network": "base",
      "asset": "USDC",
      "amount": "0.001"
    }
  }
}`,
  },
  "well-known": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/well-known \\
  -d '{"origin":"https://example.com"}'`,
    res: `{
  "ok": true,
  "discovery": {
    "origin": "https://example.com",
    "well_known_x402": "...",
    "llms_txt": "...",
    "agent_json": "..."
  }
}`,
  },
  "agent-health": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/agent-health \\
  -d '{"url":"https://x402-tools-hub.ivanbenks7-e96.workers.dev"}'`,
    res: `{
  "ok": true,
  "health": {
    "payment_ready": true,
    "discovery_ok": true,
    "latency_ms": 42,
    "score": 100
  }
}`,
  },
  "payment-decoder": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/payment-decoder \\
  -d '{"header":"PAYMENT-REQUIRED raw value"}'`,
    res: `{
  "ok": true,
  "decoded": {
    "network": "base",
    "asset": "USDC",
    "amount": "0.001",
    "pay_to": "0x5b7efd..."
  }
}`,
  },
  "receipt-notary": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/receipt-notary \\
  -d '{"resource":"/api/token-inspector","tx":"0xabc...","body":"..."}'`,
    res: `{
  "ok": true,
  "receipt": {
    "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "resource": "/api/token-inspector",
    "tx": "0xabc...",
    "ts": 1780000000
  }
}`,
  },
  "web-markdown": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/web-markdown \\
  -d '{"url":"https://example.com"}'`,
    res: `{
  "ok": true,
  "data": {
    "url": "https://example.com",
    "markdown": "# Example Domain\\n\\nThis domain is for use in illustrative examples..."
  }
}`,
  },
  "url-metadata": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/url-metadata \\
  -d '{"url":"https://example.com"}'`,
    res: `{
  "ok": true,
  "data": {
    "url": "https://example.com",
    "title": "Example Domain",
    "description": null,
    "favicon": "/favicon.ico"
  }
}`,
  },
  "json-studio": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/json-studio \\
  -d '{"json":"{\\"a\\": 1, \\"b\\": 2}","mode":"minify"}'`,
    res: `{
  "ok": true,
  "result": "{\\"a\\":1,\\"b\\":2}"
}`,
  },
  "token-counter": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/token-counter \\
  -d '{"text":"Hello world","model":"gpt-4o"}'`,
    res: `{
  "ok": true,
  "data": {
    "text_length": 11,
    "estimated_tokens": 3,
    "model": "gpt-4o"
  }
}`,
  },
  "hn-news": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/hn-news \
  -d '{"query":"AI agents","limit":5}'`,
    res: `{
  "ok": true,
  "query": "AI agents",
  "items": [
    {
      "title": "Show HN: I built an x402 agent marketplace",
      "url": "https://news.ycombinator.com/item?id=...",
      "source": "Hacker News",
      "author": "matros777",
      "points": 42,
      "comments": 13
    }
  ]
}`,
  },
  "x-search": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/x-search \
  -d '{"query":"x402 micropayments","limit":5}'`,
    res: `{
  "ok": true,
  "query": "x402 micropayments (twitter OR x)",
  "items": [
    {
      "title": "AI agents now pay per API call on Base via x402",
      "url": "https://news.google.com/rss/articles/...",
      "source": "CoinDesk",
      "published": "Fri, 25 Sep 2026 12:00:00 GMT"
    }
  ]
}`,
  },
  "ai-incidents": {
    req: `curl -X POST https://x402-tools-hub.ivanbenks7-e96.workers.dev/api/ai-incidents \
  -d '{"limit":5}'`,
    res: `{
  "ok": true,
  "items": [
    {
      "title": "Autonomous trading agent drained by prompt injection",
      "url": "https://news.ycombinator.com/item?id=...",
      "source": "Hacker News",
      "points": 87,
      "comments": 34
    }
  ]
}`,
  },
};

/** Build one tool LIST ROW: number, name, price, endpoint + collapsible examples. */
function toolRow(name: string, idx: number): string {
  const t = TOOLS[name];
  if (!t) return "";
  const ex = EXAMPLES[name];
  const price = usd(t.priceUsd);
  const human = humanName(name);

  let examples = "";
  if (ex) {
    examples =
      `<div class="doc-examples">` +
      `<div class="doc-code">` +
      `<div class="doc-code-label">Request</div>` +
      `<pre><code>${esc(ex.req)}</code></pre>` +
      `</div>` +
      (ex.res
        ? `<details class="doc-details"><summary>Response (HTTP 200)</summary>` +
          `<div class="doc-code"><pre><code>${esc(ex.res)}</code></pre></div>` +
          `</details>`
        : "") +
      `</div>`;
  }

  return (
    `<div class="doc-row" id="tool-${esc(name)}">` +
    `<div class="doc-row-main">` +
    `<span class="doc-idx">${String(idx + 1).padStart(2, "0")}</span>` +
    `<span class="doc-row-icon">${esc(t.icon)}</span>` +
    `<div class="doc-row-info">` +
    `<div class="doc-row-title">` +
    `<span class="doc-row-name">${esc(human)}</span>` +
    `<code class="doc-slug">${esc(name)}</code>` +
    `<span class="tag tag-paid">${price} USDC</span>` +
    `<span class="tag tag-free">web: free</span>` +
    `</div>` +
    `<p class="doc-row-desc">${esc(t.description)}</p>` +
    `<div class="doc-row-endpoint"><code>POST ${esc(t.path)}</code>` +
    ` <a href="/tools/${esc(name)}">browser tool →</a></div>` +
    `</div>` +
    `</div>` +
    examples +
    `</div>`
  );
}

/** Full catalog as a flat LIST, grouped by category with numbered rows. */
function catalogMarkup(): string {
  const byCategory = new Map<ToolCategory, { name: string; row: string }[]>();
  for (const [name, t] of Object.entries(TOOLS)) {
    const cat: ToolCategory = t.category ?? "data";
    const bucket = byCategory.get(cat);
    const item = { name, row: "" };
    if (bucket) bucket.push(item);
    else byCategory.set(cat, [item]);
  }

  // Render in CATEGORY_ORDER, numbering continuously across the whole catalog.
  let n = 0;
  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const bucket = byCategory.get(cat);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort((a, b) => a.name.localeCompare(b.name));
    const rows = bucket
      .map((item) => {
        item.row = toolRow(item.name, n);
        n += 1;
        return item.row;
      })
      .join("\n");
    sections.push(
      `<div class="doc-group" id="cat-${esc(cat)}">` +
        `<div class="doc-group-head">` +
        `<h2>${esc(CATEGORY_LABELS[cat])}</h2>` +
        `<span class="doc-count">${bucket.length} tools</span>` +
        `</div>` +
        `<div class="doc-list">${rows}</div>` +
        `</div>`
    );
  }
  return sections.join("\n");
}

/** TOC links to every category anchor. */
function tocMarkup(): string {
  const links: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const count = Object.values(TOOLS).filter((t) => (t.category ?? "data") === cat).length;
    if (count === 0) continue;
    links.push(
      `<a class="toc-link" href="#cat-${esc(cat)}">` +
        `<span>${esc(CATEGORY_LABELS[cat])}</span><em>${count}</em>` +
        `</a>`
    );
  }
  return `<nav class="doc-toc">${links.join("")}</nav>`;
}

export function docsPage(cfg: AppConfig): string {
  const siteUrl = cfg.siteUrl;
  const count = Object.keys(TOOLS).length;
  const prices = Object.values(TOOLS).map((t) => t.priceUsd);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const title = `Developer documentation — ${cfg.siteName}`;
  const desc = `Full reference for the x402 Tools Hub: x402 payment flow, per-call pricing, all ${count} tools with request/response examples, and machine-readable discovery endpoints.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: title,
        description: desc,
        url: `${siteUrl}/docs`,
        about: "x402 micropayments, paid API for AI agents, Base, USDC",
        isPartOf: { "@id": `${siteUrl}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Documentation", item: `${siteUrl}/docs` },
        ],
      },
      {
        "@type": "ItemList",
        name: "x402 Tools Hub — full catalog",
        numberOfItems: count,
        itemListElement: Object.entries(TOOLS).map(([name], i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: humanName(name),
          url: `${siteUrl}/tools/${name}`,
        })),
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="x402, developer documentation, paid API, AI agents, USDC, Base, micropayments, API reference, tools">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="dns-prefetch" href="https://x402.org">
<link rel="preconnect" href="https://x402.org" crossorigin>
<link rel="preload" as="style" href="/style.css">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${esc(siteUrl)}/docs">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(cfg.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(siteUrl)}/docs">
<meta property="og:image" content="${esc(siteUrl)}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(siteUrl)}/og.png">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
<style>
/* ---------- docs page (scoped) ---------- */
.docs-main { padding-top: 8px; }

.docs-hero { text-align: center; padding-top: 64px; }
.docs-hero h1 { font-size: clamp(32px, 5vw, 52px); line-height: 1.1; letter-spacing: -.03em; margin: 0 0 18px; }
.docs-hero .hero-sub { max-width: 640px; margin: 0 auto 30px; color: var(--text-dim); font-size: 17px; }
.docs-hero .hero-cta { margin-bottom: 40px; }

.docs-section { padding: 40px 0 8px; }
.docs-section h2 { font-size: 26px; letter-spacing: -.02em; margin: 0 0 14px; }
.docs-section p { color: #93a8a1; }
.docs-section a { color: var(--accent-hi); }
.docs-section code { font-family: var(--font-mono); font-size: .92em; background: rgba(255,255,255,.07); padding: 2px 6px; border-radius: 5px; }

.doc-toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
.toc-link {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 12.5px;
  color: var(--text-dim); text-decoration: none;
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: 999px; padding: 6px 12px;
  transition: border-color .18s, color .18s;
}
.toc-link:hover { border-color: rgba(16,224,160,.5); color: var(--accent-hi); }
.toc-link em { font-style: normal; color: var(--accent); font-size: 11px; }

.guide-steps { padding-left: 22px; }
.guide-steps li { margin-bottom: 8px; color: #c8dbd4; }
.guide-steps li b { color: var(--text); }

/* ---------- tool LIST ---------- */
.doc-list { display: flex; flex-direction: column; gap: 10px; }

.doc-row {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  transition: border-color .2s, box-shadow .25s;
}
.doc-row:hover { border-color: var(--border-hi); box-shadow: var(--glow); }

.doc-row-main { display: flex; gap: 14px; align-items: flex-start; }
.doc-idx {
  font-family: var(--font-mono); font-size: 13px; color: var(--text-dim);
  padding-top: 4px; min-width: 24px;
}
.doc-row-icon {
  flex: 0 0 34px; height: 34px; display: grid; place-items: center;
  border-radius: 8px; background: rgba(16,224,160,.1);
  border: 1px solid var(--border-hi); color: var(--accent);
  font-family: var(--font-mono); font-size: 15px; font-weight: 700;
}
.doc-row-info { flex: 1; min-width: 0; }
.doc-row-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 4px; }
.doc-row-name { font-size: 16px; font-weight: 600; color: var(--text); }
.doc-slug { font-size: 11.5px; color: var(--accent-hi); background: rgba(16,224,160,.08); padding: 1px 6px; border-radius: 5px; font-family: var(--font-mono); }
.doc-row-desc { margin: 0 0 8px; color: var(--text-dim); font-size: 13.5px; line-height: 1.55; }
.doc-row-endpoint { font-size: 12.5px; font-family: var(--font-mono); }
.doc-row-endpoint code { background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 5px; color: var(--text-dim); }
.doc-row-endpoint a { color: var(--accent-hi); text-decoration: none; }
.doc-row-endpoint a:hover { text-decoration: underline; }

.doc-examples { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border); }
.doc-code-label {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 6px;
}
.doc-code pre {
  margin: 0 0 10px; padding: 14px 16px; overflow-x: auto;
  background: var(--bg-code); border: 1px solid var(--border-hi); border-radius: 10px;
  font-family: var(--font-mono); font-size: 12.5px; line-height: 1.65; color: #c8dbd4;
}
.doc-details { margin-top: 2px; }
.doc-details summary {
  cursor: pointer; font-family: var(--font-mono); font-size: 12.5px;
  color: var(--text-dim); user-select: none;
}
.doc-details summary:hover { color: var(--accent-hi); }

.doc-group { padding: 36px 0 4px; }
.doc-group-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
.doc-group-head h2 { margin: 0; font-size: 26px; letter-spacing: -.02em; }
.doc-count { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); }

.doc-faq h3 { font-size: 16px; margin: 18px 0 4px; color: var(--text); }
.doc-faq p { margin: 0 0 6px; color: var(--text-dim); }

.doc-note {
  margin-top: 16px; padding: 12px 16px; border: 1px solid rgba(255,180,84,.35);
  background: rgba(255,180,84,.06); border-radius: 10px; color: #e6d9c2; font-size: 14px;
}

@media (max-width: 640px) {
  .docs-section { padding: 28px 0 4px; }
  .doc-row-main { flex-wrap: wrap; }
}
</style>
</head>
<body>

<div class="bg-grid"></div>
<div class="bg-glow"></div>

<header class="nav">
  <div class="nav-inner">
    <a class="logo" href="/">
      <span class="logo-mark">◇</span>
      <span class="logo-text">${esc(cfg.siteName)}</span>
    </a>
    <nav class="nav-links">
      <a href="/#tools">Tools</a>
      <a href="/docs" class="active">Docs</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="/api/list">API</a>
    </nav>
  </div>
</header>

<main class="docs-main">

  <section class="docs-hero">
    <div class="badge">Developer documentation</div>
    <h1>Build with the<br><span class="accent">x402 Tools Hub</span></h1>
    <p class="hero-sub">
      ${count} pay-per-call developer tools for AI agents on ${esc(cfg.network)}.
      Free web forms for humans, machine-payable API for agents.
      No accounts, no subscriptions — pure x402 micropayments.
    </p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="#payment">How to pay</a>
      <a class="btn btn-ghost" href="#catalog">Full catalog</a>
    </div>
  </section>

  <section class="docs-section" id="payment">
    <h2>1 · How agents pay (x402)</h2>
    <p>
      Every <code>/api/*</code> endpoint requires an <a href="https://x402.org" rel="noopener" target="_blank">x402</a>
      micropayment in USDC on ${esc(cfg.network)}. Prices range from <b>${usd(minPrice)}</b> to
      <b>${usd(maxPrice)}</b> per call. The flow is:
    </p>
    <ol class="guide-steps">
      <li><b>Request</b> — call the endpoint. The server answers <code>402 Payment Required</code> with the exact payment terms (amount, asset, receiving address).</li>
      <li><b>Pay</b> — sign a USDC transfer on ${esc(cfg.network)} via the x402 facilitator. Micropayments cost fractions of a cent.</li>
      <li><b>Retry</b> — resend the request with the <code>X-PAYMENT</code> header. Get the result.</li>
    </ol>
    <p>Reference client (awal CLI — this is exactly what agents run):</p>
    <div class="terminal">
      <div class="terminal-bar">
        <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
        <span class="terminal-title">agent.sh</span>
      </div>
      <pre class="terminal-body"><code><span class="c-dim">$</span> npx awal x402 pay ${esc(siteUrl)}/api/token-quote \\
    -X POST -d <span class="c-str">'{"id":"ETH","vs":"USD"}'</span>

<span class="c-dim">✓ Request completed (HTTP 200)</span></code></pre>
    </div>
    <div class="doc-note">
      <b>Free vs paid:</b> the browser tools at <code>/tools/&lt;name&gt;</code> are free for humans.
      Agent API calls at <code>/api/&lt;name&gt;</code> are always paid via x402.
    </div>
  </section>

  <section class="docs-section" id="catalog">
    <h2>2 · Full tool catalog — all ${count} tools</h2>
    <p>Every tool as a numbered list row: description, API price, endpoint, example request and response.</p>
    ${tocMarkup()}
    ${catalogMarkup()}
  </section>

  <section class="docs-section" id="discovery">
    <h2>3 · Machine-readable discovery</h2>
    <p>Agents and directories can consume the hub without scraping HTML:</p>
    <ul class="guide-steps">
      <li><code><a href="/api/list">/api/list</a></code> — full tool catalog (name, path, price, description, free_for_humans).</li>
      <li><code><a href="/openapi.json">/openapi.json</a></code> — OpenAPI 3.1 spec of every endpoint.</li>
      <li><code><a href="/llms.txt">/llms.txt</a></code> — LLM-friendly text catalog (Markdown).</li>
      <li><code><a href="/.well-known/agent.json">/.well-known/agent.json</a></code> — agent manifest (schema_version, payment protocol, tools).</li>
      <li><code><a href="/.well-known/x402">/.well-known/x402</a></code> — x402 discovery resource.</li>
      <li><code><a href="/api/stats">/api/stats</a></code> — live on-chain payment telemetry (public, free).</li>
    </ul>
  </section>

  <section class="docs-section" id="faq">
    <h2>4 · FAQ</h2>
    <div class="doc-faq">
      <h3>Do I need an account or API key?</h3>
      <p>No. Payments are pure x402 micropayments on-chain. No signup, no API keys, no subscriptions.</p>

      <h3>What does a call cost?</h3>
      <p>Between <b>${usd(minPrice)}</b> and <b>${usd(maxPrice)}</b> USDC depending on the tool. The exact price is returned in every 402 response.</p>

      <h3>Which network and asset?</h3>
      <p>${esc(cfg.network)} (USDC). The receiving address is returned in every 402 response — never hardcoded in discovery files.</p>

      <h3>Is the browser tool really free?</h3>
      <p>Yes — for humans. The web forms at <code>/tools/&lt;name&gt;</code> run free in the browser. The API is paid per call for agents.</p>

      <h3>How does my agent discover the tools automatically?</h3>
      <p>Point it at <a href="/llms.txt">/llms.txt</a> or <a href="/api/list">/api/list</a>, then pay per call via x402.</p>

      <h3>What if a call returns 402?</h3>
      <p>That's the protocol working as designed: read the payment terms from the response, sign the USDC transfer, retry with <code>X-PAYMENT</code>.</p>
    </div>
  </section>

</main>

<footer class="footer">
  <div class="footer-inner">
    <span>${esc(cfg.siteName)}</span>
    <span class="footer-sep">·</span>
    <a href="/docs">docs</a>
    <span class="footer-sep">·</span>
    <a href="/status">status</a>
    <span class="footer-sep">·</span>
    <a href="/llms.txt">llms.txt</a>
    <span class="footer-sep">·</span>
    <a href="/openapi.json">openapi.json</a>
    <span class="footer-sep">·</span>
    <a href="/.well-known/agent.json">agent.json</a>
  </div>
  <div class="footer-copy">payments on ${esc(cfg.network)} · x402 protocol</div>
</footer>

</body>
</html>`;
}