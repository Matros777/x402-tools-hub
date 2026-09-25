/**
 * x402 Tools Hub — /status page.
 *
 * Free, public, human-readable health dashboard. Client-side it fetches
 * /api/status (self-probe) and /api/stats (on-chain telemetry) and renders
 * both. No server-side state, no database.
 */

import type { AppConfig } from "../config";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function statusPage(cfg: AppConfig): string {
  const siteUrl = cfg.siteUrl;
  const title = `Status — ${cfg.siteName}`;
  const desc = `Live health and on-chain payment stats for ${cfg.siteName}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${esc(siteUrl)}/status">
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
      <a href="/">Tools</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="/api/list">API</a>
    </nav>
  </div>
</header>

<main>
  <section class="tools" style="padding-top:3rem">
    <div class="section-head">
      <h2>Status</h2>
      <p>Live health of the hub and on-chain payment stats. Refreshed on every load.</p>
    </div>

    <div class="grid" id="status-grid">
      <div class="card"><h3 class="card-title">Health</h3><p class="card-desc" id="s-health">checking…</p></div>
      <div class="card"><h3 class="card-title">Probes</h3><p class="card-desc" id="s-probes">—</p></div>
      <div class="card"><h3 class="card-title">Avg latency</h3><p class="card-desc" id="s-latency">—</p></div>
      <div class="card"><h3 class="card-title">Tools</h3><p class="card-desc" id="s-tools">—</p></div>
      <div class="card"><h3 class="card-title">Payments received</h3><p class="card-desc" id="s-payments">—</p></div>
      <div class="card"><h3 class="card-title">Volume (USDC)</h3><p class="card-desc" id="s-volume">—</p></div>
      <div class="card"><h3 class="card-title">Unique payers</h3><p class="card-desc" id="s-payers">—</p></div>
      <div class="card"><h3 class="card-title">External payments</h3><p class="card-desc" id="s-external">—</p></div>
    </div>

    <div class="section-head" style="margin-top:2.5rem">
      <h2>Probe detail</h2>
      <p>Each public discovery endpoint, checked live.</p>
    </div>
    <div class="terminal">
      <div class="terminal-bar">
        <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
        <span class="terminal-title">GET /api/status</span>
      </div>
      <pre class="terminal-body" id="probe-body"><code>loading…</code></pre>
    </div>

    <p style="margin-top:1.5rem;color:#8aa">
      Machine-readable: <a href="/api/status">/api/status</a> · <a href="/api/stats">/api/stats</a><br>
      Source of truth: on-chain USDC (Base) receipts. The known test wallet is reported separately, never hidden.
    </p>
  </section>
</main>

<footer class="footer">
  <div class="footer-inner">
    <span>${esc(cfg.siteName)}</span>
    <span class="footer-sep">·</span>
    <a href="/">home</a>
    <span class="footer-sep">·</span>
    <a href="/llms.txt">llms.txt</a>
  </div>
  <div class="footer-copy">payments on ${esc(cfg.network)} · x402 protocol</div>
</footer>

<script>
(async () => {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  try {
    const s = await (await fetch('/api/status')).json();
    set('s-health', s.status === 'ok' ? '✅ operational' : s.status === 'degraded' ? '⚠️ degraded' : '❌ down');
    set('s-probes', s.ok_count + ' / ' + s.total + ' endpoints OK');
    set('s-latency', s.avg_ms + ' ms avg');
    const body = document.getElementById('probe-body');
    if (body) {
      body.innerHTML = '<code>' + s.probes.map(p =>
        (p.ok ? '✅' : '❌') + ' ' + p.status + '  ' + p.path + '  (' + p.ms + ' ms)'
      ).join('\n') + '</code>';
    }
  } catch (e) {
    set('s-health', 'error: ' + e);
  }
  try {
    const st = await (await fetch('/api/stats')).json();
    set('s-tools', String(st.tools));
    set('s-payments', String(st.payments_received));
    set('s-volume', '$' + st.volume_usd);
    set('s-payers', String(st.unique_payers));
    set('s-external', st.external_payments + ' ($' + st.external_volume_usd + ')');
  } catch (e) {
    set('s-payments', 'error: ' + e);
  }
})();
</script>

</body>
</html>`;
}
