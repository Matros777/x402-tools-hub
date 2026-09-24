/**
 * x402 Tools Hub — landing page HTML
 * Cyber Jade palette: emerald neon on deep graphite
 */

import { TOOLS, type AppConfig } from "../config";

export function landingPage(cfg: AppConfig): string {
  const toolCards = Object.entries(TOOLS)
    .map(
      ([name, t]) => `
        <a class="card" href="/tools/${name}">
          <div class="card-icon">${t.icon}</div>
          <h3 class="card-title">${name}</h3>
          <p class="card-desc">${t.description}</p>
          <div class="card-meta">
            <span class="tag tag-free">web: free</span>
            <span class="tag tag-paid">api: $${t.priceUsd} USDC</span>
          </div>
        </a>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${cfg.siteName} — paid tools for AI agents</title>
<meta name="description" content="Free web tools for humans, paid API for AI agents. x402 micropayments on ${cfg.network}.">
<meta name="keywords" content="x402, AI agents, paid API, USDC, Base, micropayments, developer tools, web tools, pay-per-call">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${cfg.siteUrl}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${cfg.siteName}">
<meta property="og:title" content="${cfg.siteName} — paid tools for AI agents">
<meta property="og:description" content="Free web tools for humans, paid API for AI agents. x402 micropayments on ${cfg.network}.">
<meta property="og:url" content="${cfg.siteUrl}/">
<meta property="og:image" content="${cfg.siteUrl}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${cfg.siteName} — paid tools for AI agents">
<meta name="twitter:description" content="Free web tools for humans, paid API for AI agents. x402 micropayments on ${cfg.network}.">
<meta name="twitter:image" content="${cfg.siteUrl}/og.png">
</head>
<body>

<div class="bg-grid"></div>
<div class="bg-glow"></div>

<header class="nav">
  <div class="nav-inner">
    <a class="logo" href="/">
      <span class="logo-mark">◇</span>
      <span class="logo-text">${cfg.siteName}</span>
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
    <div class="badge">x402 · ${cfg.network}</div>
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
      <pre class="terminal-body"><code><span class="c-dim">$</span> curl -X POST ${cfg.siteUrl}/api/web-markdown \\
    -H <span class="c-str">"Content-Type: application/json"</span> \\
    -d <span class="c-str">'{"url":"https://example.com"}'</span>

<span class="c-warn">402 Payment Required</span>
<span class="c-dim">→ pay $0.001 USDC on ${cfg.network}, retry with X-PAYMENT header</span></code></pre>
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
        <p>Sign a USDC transfer on ${cfg.network} via the x402 facilitator. Micropayments, fractions of a cent.</p>
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
    <span>${cfg.siteName}</span>
    <span class="footer-sep">·</span>
    <a href="/llms.txt">llms.txt</a>
    <span class="footer-sep">·</span>
    <a href="/openapi.json">openapi.json</a>
    <span class="footer-sep">·</span>
    <a href="/.well-known/agent.json">agent.json</a>
  </div>
  <div class="footer-copy">payments on ${cfg.network} · x402 protocol</div>
</footer>

</body>
</html>`;
}