/**
 * x402 Tools Hub — landing page HTML
 * Cyber Jade palette: emerald neon on deep graphite
 *
 * SEO: JSON-LD (Organization + WebSite + ItemList), meta robots, preconnect,
 * human-readable card titles.
 */

import { TOOLS, type AppConfig } from "../config";

/** Escape HTML special characters in interpolated strings. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Human-readable name from a kebab-case tool slug (json-studio -> JSON Studio). */
export function humanName(slug: string): string {
  const special: Record<string, string> = {
    x402: "x402",
    json: "JSON",
    jwt: "JWT",
    url: "URL",
    html: "HTML",
    css: "CSS",
    api: "API",
    ai: "AI",
    llm: "LLM",
    seo: "SEO",
    wcag: "WCAG",
    md5: "MD5",
    sha: "SHA",
    rfc: "RFC",
    env: "env",
    git: "Git",
  };
  return slug
    .split("-")
    .map((w) => special[w] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Serialize a JSON-LD object safely for inline <script>. */
export function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

export function landingPage(cfg: AppConfig): string {
  const tools = Object.entries(TOOLS);

  const toolCards = tools
    .map(
      ([name, t]) => `
        <a class="card" href="/tools/${esc(name)}">
          <div class="card-icon">${esc(t.icon)}</div>
          <h3 class="card-title">${esc(humanName(name))}</h3>
          <p class="card-desc">${esc(t.description)}</p>
          <div class="card-meta">
            <span class="tag tag-free">web: free</span>
            <span class="tag tag-paid">api: $${esc(String(t.priceUsd))} USDC</span>
          </div>
        </a>`
    )
    .join("");

  const title = `${cfg.siteName} — paid tools for AI agents`;
  const desc = `Free web tools for humans, paid API for AI agents. x402 micropayments on ${cfg.network}.`;
  const siteUrl = cfg.siteUrl;

  const itemList = tools.map(([name], i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: humanName(name),
    url: `${siteUrl}/tools/${name}`,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: cfg.siteName,
        url: siteUrl,
        logo: `${siteUrl}/favicon.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: cfg.siteName,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "ItemList",
        name: `${cfg.siteName} tools`,
        numberOfItems: tools.length,
        itemListElement: itemList,
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
<meta name="keywords" content="x402, AI agents, paid API, USDC, Base, micropayments, developer tools, web tools, pay-per-call">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="dns-prefetch" href="https://x402.org">
<link rel="preconnect" href="https://x402.org" crossorigin>
<link rel="preload" as="style" href="/style.css">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${esc(siteUrl)}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(siteUrl)}/">
<meta property="og:image" content="${esc(siteUrl)}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(siteUrl)}/og.png">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
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
      <a href="#tools">Tools</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="/api/list">API</a>
    </nav>
  </div>
</header>

<main>
  <section class="hero">
    <div class="badge">x402 · ${esc(cfg.network)}</div>
    <h1 class="hero-title">Tools for humans.<br><span class="accent">Pay-per-call for agents.</span></h1>
    <p class="hero-sub">
      A growing collection of utilities with a free web form for people and a machine-payable
      API for AI agents. No accounts, no subscriptions — just x402 micropayments.
    </p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="#tools">Browse tools</a>
      <a class="btn btn-ghost" href="/api/list">Discovery JSON</a>
    </div>
    <div class="terminal">
      <div class="terminal-bar">
        <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
        <span class="terminal-title">agent.sh</span>
      </div>
      <pre class="terminal-body"><code><span class="c-dim">$</span> curl -X POST ${esc(siteUrl)}/api/web-markdown \\
    -H <span class="c-str">"Content-Type: application/json"</span> \\
    -d <span class="c-str">'{"url":"https://example.com"}'</span>

<span class="c-warn">402 Payment Required</span>
<span class="c-dim">→ pay $0.001 USDC on ${esc(cfg.network)}, retry with X-PAYMENT header</span></code></pre>
    </div>
  </section>

  <section class="tools" id="tools">
    <div class="section-head">
      <h2>Available tools</h2>
      <p>Free in the browser. Machine-payable over the API.</p>
    </div>
    <div class="grid">
      ${toolCards}
    </div>
  </section>

  <section class="how">
    <div class="section-head">
      <h2>How agents pay</h2>
      <p>Three steps, no signup.</p>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h3>Request</h3>
        <p>Call any <code>/api/*</code> endpoint. The server replies <code>402</code> with payment requirements.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h3>Pay</h3>
        <p>Sign a USDC transfer on ${esc(cfg.network)} via the x402 facilitator. Micropayments, fractions of a cent.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h3>Retry</h3>
        <p>Resend the request with the <code>X-PAYMENT</code> header. Get the result.</p>
      </div>
    </div>
  </section>
</main>

<footer class="footer">
  <div class="footer-inner">
    <span>${esc(cfg.siteName)}</span>
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
