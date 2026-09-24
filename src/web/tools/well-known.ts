/**
 * Well-Known Reader — discovery card for any origin.
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
      "One call reads the discovery surface of any host: /.well-known/x402, /.well-known/x402-discovery, llms.txt, openapi.json, robots.txt, agent.json and sitemap.xml. Returns a compact service card agents can use before deciding to pay.",

    howToUse: [
      "Paste an origin (https://host — no trailing path).",
      "Run to fetch the well-known discovery surface in one pass.",
      "Review which discovery layers exist (x402, openapi, agent.json, llms, robots).",
      "Use the card to decide whether the service is worth probing next.",
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
          <input id="wk-origin" class="input grow" type="text" placeholder="https://example.com" spellcheck="false" autocomplete="off">
          <button id="wk-run" class="btn btn-primary" type="button">Read</button>
        </div>
        <div id="wk-status" class="status" role="status"></div>
        <div id="wk-out"></div>
      </div>
    `,

    script: `
(function () {
  var originEl = document.getElementById('wk-origin');
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
    var flag = function (name, ok) {
      return '<div class="passport-stat"><span class="ps-label">' + esc(name) + '</span><span class="ps-value">' + (ok ? 'yes' : 'no') + '</span></div>';
    };
    var summary =
      '<div class="passport-grid">' +
        flag('x402', d.has_x402_discovery) +
        flag('openapi', d.has_openapi) +
        flag('agent.json', d.has_agent_json) +
        flag('llms.txt', d.has_llms) +
      '</div>';

    var rows = (d.entries || []).map(function (e) {
      return '<tr>' +
        '<td class="mono">' + esc(e.path) + '</td>' +
        '<td class="num">' + esc(e.status == null ? '—' : e.status) + '</td>' +
        '<td class="mono">' + esc(e.content_type || '—') + '</td>' +
        '<td class="num">' + esc(e.bytes == null ? '—' : e.bytes) + '</td>' +
        '<td class="mono small">' + esc(e.summary || '') + '</td>' +
        '</tr>';
    }).join('');

    out.innerHTML = summary +
      '<h3 class="section-title">Discovery surface</h3>' +
      '<table class="data-table"><thead><tr><th>Path</th><th>Status</th><th>Type</th><th>Bytes</th><th>Summary</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function run() {
    var o = (originEl.value || '').trim();
    if (!/^https?:\/\//i.test(o)) { setStatus('Enter origin like https://example.com', false); return; }
    setStatus('Reading discovery surface…', true);
    out.innerHTML = '';
    fetch('/api/well-known/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin: o }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Read failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.entries.length + ' endpoints', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  originEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}
