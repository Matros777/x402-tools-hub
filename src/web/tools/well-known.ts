/**
 * Well-Known Reader — discovery card for any origin (canonical DoD).
 *
 * Free browser page. Its lookup endpoint (/api/well-known/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/well-known) is the same payload for agents.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function wellKnownPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "well-known",
    title: "Well-Known Reader",
    intro:
      "Pass any URL on a host and the Reader normalizes it to the origin, then probes the canonical discovery surface: /.well-known/x402, /.well-known/agent.json, /agent.json, /openapi.json, /llms.txt and /robots.txt. Each entry reports found/missing/error plus the actual source URL probed.",

    howToUse: [
      "Paste any URL on the host (path is ignored; origin is probed).",
      "Run to read the six canonical discovery documents in one pass.",
      "Review the found/missing/error status per path.",
      "Use the card before deciding whether to probe the service for payment.",
      "Agents call the paid POST /api/well-known endpoint ($0.001).",
    ],
    useCases: [
      "Checking whether a service publishes x402 metadata before probing it.",
      "Building a discovery map of an origin for routing decisions.",
      "Verifying our own hub's discovery surface from the outside.",
      "Feeding a structured service card into Agent Health.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="wk-url" class="input grow" type="text" placeholder="https://host/api/foo (origin probed)" spellcheck="false" autocomplete="off">
          <button id="wk-run" class="btn btn-primary" type="button">Read</button>
        </div>
        <div id="wk-status" class="status" role="status"></div>
        <div id="wk-out"></div>
      </div>
    `,

    script: `
(function () {
  var urlEl = document.getElementById('wk-url');
  var btn = document.getElementById('wk-run');
  var status = document.getElementById('wk-status');
  var out = document.getElementById('wk-out');

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

  function render(d) {
    var rows = (d.entries || []).map(function (e) {
      var cls = e.status === 'found' ? 'status-ok' : e.status === 'missing' ? 'status-err' : '';
      return '<tr>' +
        '<td class="mono">' + esc(e.name) + '</td>' +
        '<td><span class="' + cls + '">' + esc(e.status) + '</span></td>' +
        '<td class="num">' + esc(e.http_status == null ? '—' : e.http_status) + '</td>' +
        '<td class="mono small">' + esc(e.source) + '</td>' +
        '<td class="mono small">' + esc(e.summary || '') + '</td>' +
        '</tr>';
    }).join('');

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    out.innerHTML =
      '<p class="hint">origin: ' + esc(d.origin) + '</p>' +
      '<table class="data-table"><thead><tr><th>Path</th><th>Status</th><th>HTTP</th><th>Source URL</th><th>Summary</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (notes ? '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>' : '');
  }

  function run() {
    var u = (urlEl.value || '').trim();
    if (!u) { setStatus('Enter a URL', false); return; }
    setStatus('Reading discovery surface…', true);
    out.innerHTML = '';
    fetch('/api/well-known/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: u }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Read failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.entries.length + ' paths', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}