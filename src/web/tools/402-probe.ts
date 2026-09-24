/**
 * 402 Probe — is this URL really an x402 endpoint, and under what terms?
 *
 * Free browser page. Its lookup endpoint (/api/402-probe/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/402-probe) is the same payload for agents.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function x402ProbePage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "402-probe",
    title: "402 Probe",
    intro:
      "Before paying, ask: is this URL really an x402 endpoint right now, and under what exact terms? Probe returns the scheme, network, asset, amount, payTo and timeout of the payment challenge — plus a validity check of the challenge itself. Optionally reads /.well-known/x402 on the same origin.",

    howToUse: [
      "Paste any API URL you are about to pay.",
      "Pick a method (GET defaults; 404/405 auto-retries as POST).",
      "Run — see whether it returns 402 and the exact payment terms.",
      "Use the challenge-validity flag to decide whether to proceed to payment.",
      "Agents call the paid POST /api/402-probe endpoint ($0.002).",
    ],
    useCases: [
      "Verifying an endpoint is still x402 before sending USDC.",
      "Reading payTo / amount / network from the live challenge.",
      "Checking a listed service from a directory before first payment.",
      "Detecting endpoints that silently stopped requiring payment.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="pp-url" class="input grow" type="text" placeholder="https://…/api/endpoint" spellcheck="false" autocomplete="off">
          <select id="pp-method" class="select">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
          </select>
          <label class="field-label-inline"><input id="pp-describe" type="checkbox" checked> describe</label>
          <button id="pp-run" class="btn btn-primary" type="button">Probe</button>
        </div>
        <div id="pp-status" class="status" role="status"></div>
        <div id="pp-out"></div>
      </div>
    `,

    script: `
(function () {
  var urlEl = document.getElementById('pp-url');
  var methodEl = document.getElementById('pp-method');
  var describeEl = document.getElementById('pp-describe');
  var btn = document.getElementById('pp-run');
  var status = document.getElementById('pp-status');
  var out = document.getElementById('pp-out');

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

  function render(r) {
    var blocks = [];
    var vclass = r.x402 ? (r.parse.challenge_valid ? 'verdict-ok' : 'verdict-warn') : 'verdict-err';
    blocks.push('<h3 class="section-title">Result</h3><div class="verdict ' + vclass + '">' +
      (r.x402 ? 'X402 ' + (r.parse.challenge_valid ? '· challenge valid' : '· challenge invalid') : 'NOT X402') +
      '</div>');

    blocks.push('<div class="passport-grid">' +
      '<div class="passport-stat"><span class="ps-label">HTTP</span><span class="ps-value">' + esc(r.http_status) + '</span></div>' +
      '<div class="passport-stat"><span class="ps-label">Method</span><span class="ps-value">' + esc(r.method_tried) + '</span></div>' +
      '<div class="passport-stat"><span class="ps-label">Headers</span><span class="ps-value">' + esc((r.headers_present || []).join(', ') || '—') + '</span></div>' +
      '</div>');

    if (r.challenge) {
      var ch = r.challenge;
      blocks.push('<h3 class="section-title">Challenge</h3>');
      blocks.push('<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Scheme</span><span class="ps-value">' + esc(ch.scheme || '—') + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Network</span><span class="ps-value">' + esc(ch.network || '—') + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Asset</span><span class="ps-value">' + esc(ch.asset || '—') + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Amount</span><span class="ps-value">' + esc(ch.amount_usd != null ? '$' + ch.amount_usd : (ch.amount_atomic || '—')) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">payTo</span><span class="ps-value small">' + esc(ch.pay_to || '—') + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Timeout</span><span class="ps-value">' + esc(ch.max_timeout_seconds != null ? ch.max_timeout_seconds + 's' : '—') + '</span></div>' +
        '</div>');
    }

    if ((r.parse.errors || []).length) {
      blocks.push('<h3 class="section-title">Parse errors</h3><ul class="flag-list">' + r.parse.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>');
    }

    if (r.hints && r.hints.well_known) {
      blocks.push('<p class="hint">well-known: ' + esc(r.hints.well_known) + '</p>');
    }

    if ((r.notes || []).length) {
      blocks.push('<h3 class="section-title">Notes</h3><ul class="flag-list">' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>');
    }

    out.innerHTML = blocks.join('');
  }

  function run() {
    var u = (urlEl.value || '').trim();
    if (!u) { setStatus('Enter a URL', false); return; }
    var payload = {
      url: u,
      method: methodEl.value,
      mode: describeEl.checked ? 'describe' : 'challenge',
    };
    setStatus('Probing…', true);
    out.innerHTML = '';
    fetch('/api/402-probe/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Probe failed', false); return; }
        render(d.data);
        setStatus('OK · HTTP ' + d.data.http_status + (d.data.x402 ? ' · x402' : ''), true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}