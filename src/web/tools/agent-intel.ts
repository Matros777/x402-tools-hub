/**
 * Agent Intelligence — pipeline: Web Markdown + Agent Registry + Passport.
 *
 * Free browser page. Its lookup endpoint (/api/agent-intel/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/agent-intel) is the same payload for agents.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function agentIntelPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "agent-intel",
    title: "Agent Intelligence",
    intro:
      "One pipeline over three layers: fetch a page as Markdown (content), discover agents and merchants around a seed wallet (registry), and trust-check a specific wallet (passport). Feed it a URL, a seed wallet, an address — or all three — and get a combined report before interacting.",

    howToUse: [
      "Paste a URL to read a page as Markdown (content layer).",
      "Paste a seed wallet to discover its on-chain counterparties (registry layer).",
      "Paste an address to get its Trust Score (passport layer).",
      "Run the pipeline to assemble the report and a verdict.",
      "Use the paid POST /api/agent-intel endpoint from your agent.",
    ],
    useCases: [
      "Researching a competitor or docs page and the agents around it in one call.",
      "Discovering merchants via a known wallet, then scoring them before transacting.",
      "An agent deciding whether to interact with a counterparty: content + discovery + trust.",
      "Building an autonomous due-diligence step into an x402 workflow.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <label class="field-label">URL (content layer, optional)
            <input id="ai-url" class="input" type="text" placeholder="https://… page to read as Markdown" spellcheck="false" autocomplete="off">
          </label>
        </div>
        <div class="query-row">
          <label class="field-label">Seed wallet (registry layer, optional)
            <input id="ai-seed" class="input" type="text" placeholder="0x… seed to discover counterparties" spellcheck="false" autocomplete="off">
          </label>
          <label class="field-label">Address to check (passport layer, optional)
            <input id="ai-addr" class="input" type="text" placeholder="0x… wallet to trust-score" spellcheck="false" autocomplete="off">
          </label>
        </div>
        <div class="query-row">
          <button id="ai-run" class="btn btn-primary" type="button">Run pipeline</button>
        </div>
        <div id="ai-status" class="status" role="status"></div>
        <div id="ai-out"></div>
      </div>
    `,

    script: `
(function () {
  var urlEl = document.getElementById('ai-url');
  var seedEl = document.getElementById('ai-seed');
  var addrEl = document.getElementById('ai-addr');
  var btn = document.getElementById('ai-run');
  var status = document.getElementById('ai-status');
  var out = document.getElementById('ai-out');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function setStatus(msg, ok) {
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }
  function short(h) { return h ? h.slice(0, 10) + '…' + h.slice(-6) : ''; }

  function render(r) {
    var blocks = [];

    // Verdict
    var vclass = 'verdict-' + (r.verdict === 'full_intel' ? 'ok' : r.verdict === 'partial_intel' ? 'warn' : 'err');
    blocks.push('<h3 class="section-title">Verdict</h3><div class="verdict ' + vclass + '">' + esc(r.verdict) + '</div>');

    if ((r.flags || []).length) {
      blocks.push('<h3 class="section-title">Flags</h3><ul class="flag-list">' + r.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>');
    }
    if ((r.notes || []).length) {
      blocks.push('<h3 class="section-title">Notes</h3><ul class="note-list">' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>');
    }

    // Content
    if (r.content) {
      var c = r.content;
      blocks.push('<h3 class="section-title">Content</h3>');
      blocks.push('<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">URL</span><span class="ps-value small">' + esc(c.url) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Title</span><span class="ps-value small">' + esc(c.title || '—') + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Chars</span><span class="ps-value">' + esc(c.chars) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Words</span><span class="ps-value">' + esc(c.words) + '</span></div>' +
        (c.truncated ? '<div class="passport-stat"><span class="ps-label">Truncated</span><span class="ps-value">yes</span></div>' : '') +
        '</div>');
      blocks.push('<pre class="out">' + esc(c.markdown.slice(0, 2000)) + '</pre>');
    }

    // Registry
    if (r.registry) {
      var reg = r.registry;
      var rows = (reg.entries || []).slice(0, 15).map(function (e, i) {
        return '<tr>' +
          '<td class="num">' + (i + 1) + '</td>' +
          '<td class="mono">' + esc(short(e.address)) + '</td>' +
          '<td class="num">' + esc(e.score) + '/100</td>' +
          '<td><span class="tier-' + esc(e.tier) + '">' + esc(e.tier) + '</span></td>' +
          '<td class="num">' + esc(e.seen_as_counterparty_of) + '</td>' +
          '</tr>';
      }).join('');
      blocks.push('<h3 class="section-title">Registry (' + reg.total_discovered + ' wallets)</h3>');
      blocks.push(rows
        ? '<table class="data-table"><thead><tr><th>#</th><th>Wallet</th><th>Score</th><th>Tier</th><th>Linked</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="hint">No counterparties found.</p>');
    }

    // Passport
    if (r.passport) {
      var p = r.passport;
      blocks.push('<h3 class="section-title">Passport</h3>');
      blocks.push('<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Trust score</span><span class="ps-value">' + esc(p.trust_score) + '/100</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Tier</span><span class="ps-value tier-' + esc(p.tier) + '">' + esc(p.tier) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Payments</span><span class="ps-value">' + esc(p.tx_count) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Total paid</span><span class="ps-value">$' + esc(p.total_paid_usd.toFixed(4)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Merchants</span><span class="ps-value">' + esc(p.merchants_count) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Age (days)</span><span class="ps-value">' + esc(p.wallet_age_days == null ? '—' : p.wallet_age_days) + '</span></div>' +
        '</div>');
    }

    out.innerHTML = blocks.join('');
  }

  function run() {
    var payload = {};
    var u = (urlEl.value || '').trim();
    if (u) payload.url = u;
    var s = (seedEl.value || '').trim();
    if (s) payload.seed = s;
    var a = (addrEl.value || '').trim();
    if (a) payload.address = a;
    if (!payload.url && !payload.seed && !payload.address) {
      setStatus('Fill at least one field (URL, seed or address)', false);
      return;
    }
    setStatus('Running pipeline…', true);
    out.innerHTML = '';
    fetch('/api/agent-intel/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Pipeline failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.verdict, true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
})();
`,
  });
}