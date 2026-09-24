/**
 * Agent Studio — describe an agent, get a manifest, dry-run its cost.
 *
 * Free browser page. Its lookup endpoint (/api/agent-studio/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/agent-studio) is the same payload for
 * agents, at $0.002 USDC per call.
 *
 * No database, no private keys: the wallet field is watch-only.
 */

import { TOOLS, type AppConfig } from "../../config";
import { renderToolPage } from "../tool-page";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toolCheckbox(name: string, description: string, priceUsd: number): string {
  return (
    `<label class="as-tool">` +
    `<input type="checkbox" class="as-tool-cb" value="${esc(name)}"> ` +
    `<b>${esc(name)}</b> <span class="as-price">$${priceUsd}</span>` +
    `<span class="as-desc">${esc(description)}</span>` +
    `</label>`
  );
}

export function agentStudioPage(cfg: AppConfig): string {
  const toolBoxes = Object.entries(TOOLS)
    .map(([name, t]) => toolCheckbox(name, t.description, t.priceUsd))
    .join("");

  return renderToolPage(cfg, {
    name: "agent-studio",
    title: "Agent Studio",
    intro:
      "Describe your agent in one sentence, pick the hub tools it may call, and get back a portable <code>agent.json</code> manifest plus a capability check and a dry-run cost model. Supply a watch-only wallet for a live trust check — no private keys ever touch the Worker.",

    howToUse: [
      "Give the agent a name and a one-line goal.",
      "Tick the hub tools it may call and set expected calls per month.",
      "Optionally paste a watch-only 0x wallet for a live trust check.",
      "Click Dry-run to build the manifest, check capabilities and model cost.",
      "Download the resulting agent.json and wire it into your runner.",
    ],
    useCases: [
      "Bootstrapping a new x402 agent without writing plumbing by hand.",
      "Estimating spend before you ship an autonomous agent.",
      "Screening a payer wallet via the Trust Layer before handing it work.",
      "Agents generating their own manifest via the paid POST /api/agent-studio endpoint.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <label class="field-label">Agent name
            <input id="as-name" class="input" type="text" placeholder="e.g. Wallet Sentry" maxlength="80" autocomplete="off">
          </label>
          <label class="field-label">Goal (one line)
            <input id="as-goal" class="input" type="text" placeholder="e.g. Watch Base wallets for anomalies" maxlength="400" autocomplete="off">
          </label>
        </div>

        <div class="query-row">
          <label class="field-label">Calls / month
            <input id="as-calls" class="input" type="number" min="1" step="1" value="1000">
          </label>
          <label class="field-label">Subscription to compare (USD, optional)
            <input id="as-sub" class="input" type="number" min="0" step="0.01" placeholder="e.g. 49">
          </label>
          <label class="field-label">Wallet (watch-only, optional)
            <input id="as-wallet" class="input" type="text" placeholder="0x…" spellcheck="false" autocomplete="off">
          </label>
        </div>

        <div class="field-label">Tools the agent may call</div>
        <div id="as-tools" class="as-tools">${toolBoxes}</div>

        <div class="query-row">
          <button id="as-run" class="btn btn-primary" type="button">Dry-run</button>
          <button id="as-copy" class="btn" type="button">Copy agent.json</button>
          <button id="as-download" class="btn" type="button">Download agent.json</button>
        </div>
        <div id="as-status" class="status" role="status"></div>
        <div id="as-out"></div>
        <h3 class="section-title">agent.json preview</h3>
        <pre id="as-manifest" class="out"></pre>
      </div>
    `,

    script: `
(function () {
  var nameEl = document.getElementById('as-name');
  var goalEl = document.getElementById('as-goal');
  var callsEl = document.getElementById('as-calls');
  var subEl = document.getElementById('as-sub');
  var walletEl = document.getElementById('as-wallet');
  var runBtn = document.getElementById('as-run');
  var copyBtn = document.getElementById('as-copy');
  var dlBtn = document.getElementById('as-download');
  var statusEl = document.getElementById('as-status');
  var outEl = document.getElementById('as-out');
  var manifestEl = document.getElementById('as-manifest');
  var lastManifest = '';
  var lastReport = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function setStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('status-ok', !!ok);
    statusEl.classList.toggle('status-err', !ok);
  }
  function money(n) { return '$' + Number(n || 0).toFixed(6); }
  function pct(n) { return (Number(n || 0) * 100).toFixed(1) + '%'; }

  function collect() {
    var tools = Array.prototype.slice
      .call(document.querySelectorAll('.as-tool-cb'))
      .filter(function (cb) { return cb.checked; })
      .map(function (cb) { return cb.value; });
    var input = {
      name: (nameEl.value || '').trim() || 'untitled-agent',
      goal: (goalEl.value || '').trim(),
      tools: tools,
      calls_per_month: Number(callsEl.value) || 1000,
    };
    var sub = (subEl.value || '').trim();
    if (sub !== '') input.subscription_usd = Number(sub);
    var w = (walletEl.value || '').trim();
    if (w !== '') input.wallet = w;
    return input;
  }

  function renderReport(rep) {
    var caps = rep.capabilities;
    var cost = rep.cost;
    var tools = caps.tools.map(function (t) {
      return '<tr>' +
        '<td class="mono">' + esc(t.name) + '</td>' +
        '<td class="mono">' + esc(t.path) + '</td>' +
        '<td class="num">' + esc(money(t.priceUsd)) + '</td>' +
        '<td class="num">' + esc(cost.total_calls) + '</td>' +
        '</tr>';
    }).join('');

    var verdictClass = 'verdict-' + rep.verdict;
    var flags = (rep.flags || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
    var notes = (rep.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    var trustBlock = rep.trust
      ? '<div class="passport-grid">' +
          '<div class="passport-stat"><span class="ps-label">Trust score</span><span class="ps-value">' + esc(rep.trust.score) + '/100</span></div>' +
          '<div class="passport-stat"><span class="ps-label">Tier</span><span class="ps-value tier-' + esc(rep.trust.tier) + '">' + esc(rep.trust.tier) + '</span></div>' +
          '<div class="passport-stat"><span class="ps-label">Payments</span><span class="ps-value">' + esc(rep.trust.tx_count) + '</span></div>' +
          '<div class="passport-stat"><span class="ps-label">Total paid</span><span class="ps-value">' + esc(money(rep.trust.total_paid_usd)) + '</span></div>' +
        '</div>'
      : '<p class="hint">No wallet supplied — trust check skipped.</p>';

    outEl.innerHTML =
      '<h3 class="section-title">Verdict</h3>' +
      '<div class="verdict ' + verdictClass + '">' + esc(rep.verdict.toUpperCase()) + '</div>' +
      (flags ? '<h3 class="section-title">Flags</h3><ul class="flag-list">' + flags + '</ul>' : '') +
      (notes ? '<h3 class="section-title">Notes</h3><ul class="note-list">' + notes + '</ul>' : '') +
      '<h3 class="section-title">Capabilities</h3>' +
      (tools
        ? '<table class="data-table"><thead><tr><th>Tool</th><th>Endpoint</th><th>Price / call</th><th>Calls / month</th></tr></thead><tbody>' + tools + '</tbody></table>'
        : '<p class="hint">No tools selected.</p>') +
      '<h3 class="section-title">Cost model</h3>' +
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Total calls</span><span class="ps-value">' + esc(cost.total_calls) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">API cost</span><span class="ps-value">' + esc(money(cost.api_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Network cost</span><span class="ps-value">' + esc(money(cost.network_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Total</span><span class="ps-value">' + esc(money(cost.total_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Effective / call</span><span class="ps-value">' + esc(money(cost.effective_price_per_call_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Overhead</span><span class="ps-value">' + esc(pct(cost.overhead_ratio)) + '</span></div>' +
        (cost.subscription_usd !== null
          ? '<div class="passport-stat"><span class="ps-label">Subscription</span><span class="ps-value">' + esc(money(cost.subscription_usd)) + '</span></div>' +
            '<div class="passport-stat"><span class="ps-label">Savings vs sub</span><span class="ps-value">' + esc(money(cost.savings_vs_subscription_usd)) + '</span></div>' +
            '<div class="passport-stat"><span class="ps-label">Break-even calls</span><span class="ps-value">' + esc(cost.break_even_calls) + '</span></div>'
          : '') +
      '</div>' +
      '<h3 class="section-title">Wallet trust</h3>' +
      trustBlock;
  }

  function run() {
    var input = collect();
    setStatus('Running dry-run…', true);
    outEl.innerHTML = '';
    manifestEl.textContent = '';
    fetch('/api/agent-studio/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Lookup failed', false); return; }
        lastReport = d.data;
        lastManifest = JSON.stringify(d.data.manifest, null, 2);
        manifestEl.textContent = lastManifest;
        renderReport(d.data);
        setStatus('OK · ' + d.data.verdict + ' · ' + d.data.capabilities.tools.length + ' tools', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  function copyManifest() {
    if (!lastManifest) { setStatus('Run a dry-run first', false); return; }
    navigator.clipboard.writeText(lastManifest).then(
      function () { setStatus('agent.json copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  }

  function downloadManifest() {
    if (!lastManifest) { setStatus('Run a dry-run first', false); return; }
    var blob = new Blob([lastManifest], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var nm = (lastReport && lastReport.manifest && lastReport.manifest.name) || 'agent';
    a.href = url;
    a.download = nm.replace(/[^a-z0-9-_.]+/gi, '-').toLowerCase() + '.agent.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Downloaded', true);
  }

  runBtn.addEventListener('click', run);
  copyBtn.addEventListener('click', copyManifest);
  dlBtn.addEventListener('click', downloadManifest);
})();
`,
  });
}
