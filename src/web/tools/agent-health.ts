/**
 * Agent Health — Cosmic Agent Console.
 *
 * Free browser page. Its lookup endpoint (/api/agent-health/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/agent-health) is the same payload for
 * agents at $0.003 USDC per call.
 *
 * Visual language: deep-space #03050A, electric cyan, ultraviolet, white,
 * glass panels, starfield, orbital rings, central Agent Core, radial
 * nodes, sequential scan animation, real timing values.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function agentHealthPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "agent-health",
    title: "Agent Health",
    intro:
      "Cosmic Agent Console: probe payment readiness, read the discovery surface and measure latency in one pass. Verdicts are strictly technical — PAYMENT_READY means the endpoint looks ready for an x402 call, never that it is safe or trustworthy.",

    howToUse: [
      "Paste any API URL you plan to call.",
      "Run the scan — it probes x402, reads well-known discovery and times latency.",
      "Read the Agent Core verdict and the discovery matrix.",
      "Check the real per-stage timings at the bottom.",
      "Agents call the paid POST /api/agent-health endpoint ($0.003).",
    ],
    useCases: [
      "Pre-payment readiness check for autonomous agents.",
      "One-call service card: payment terms + discovery + latency.",
      "Monitoring the hub's own endpoints from the outside.",
      "A thin orchestration layer on top of 402 Probe and Well-Known Reader.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="ah-url" class="input grow" type="text" placeholder="https://…/api/endpoint" spellcheck="false" autocomplete="off">
          <button id="ah-run" class="btn btn-primary" type="button">SCAN</button>
        </div>
        <div id="ah-status" class="status" role="status"></div>
      </div>

      <div class="cosmic-wrap" id="cosmic-wrap" hidden>
        <div class="cosmic-stage">
          <div class="cosmic-scanline" id="cosmic-scanline"></div>
          <div class="cosmic-core" id="cosmic-core">
            <div class="cosmic-core-ring r1"></div>
            <div class="cosmic-core-ring r2"></div>
            <div class="cosmic-core-ring r3"></div>
            <div class="cosmic-core-orb" id="cosmic-orb">◉</div>
            <div class="cosmic-core-label" id="cosmic-core-label">SCANNING TARGET</div>
          </div>
          <div class="cosmic-node n-dns"><span>DNS</span></div>
          <div class="cosmic-node n-tls"><span>TLS</span></div>
          <div class="cosmic-node n-pay"><span>PAYMENT</span></div>
          <div class="cosmic-node n-x402"><span>X402</span></div>
          <div class="cosmic-node n-lat"><span>LATENCY</span></div>
          <div class="cosmic-node n-api"><span>API</span></div>
        </div>
        <div id="cosmic-result"></div>
      </div>
    `,

    script: `
(function () {
  var urlEl = document.getElementById('ah-url');
  var btn = document.getElementById('ah-run');
  var status = document.getElementById('ah-status');
  var wrap = document.getElementById('cosmic-wrap');
  var core = document.getElementById('cosmic-core');
  var coreLabel = document.getElementById('cosmic-core-label');
  var orb = document.getElementById('cosmic-orb');
  var result = document.getElementById('cosmic-result');
  var scanline = document.getElementById('cosmic-scanline');

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

  var STAGES = ['DNS', 'TLS', 'HTTP', 'X402', 'FACILITATOR', 'DISCOVERY', 'LATENCY', 'FINALIZING'];

  function animateScan() {
    wrap.hidden = false;
    result.innerHTML = '';
    coreLabel.textContent = 'SCANNING TARGET';
    orb.classList.remove('ok','warn','err');
    orb.textContent = '◉';
    var i = 0;
    return new Promise(function (resolve) {
      var iv = setInterval(function () {
        if (i < STAGES.length) {
          coreLabel.textContent = STAGES[i];
          i++;
        } else {
          clearInterval(iv);
          resolve();
        }
      }, 220);
    });
  }

  function render(d) {
    var v = d.verdict;
    var cls = 'err';
    var title = v;
    if (v === 'PAYMENT_READY') { cls = 'ok'; title = 'PAYMENT READY'; }
    else if (v === 'SLOW') { cls = 'warn'; }
    else if (v === 'CHALLENGE_INVALID') { cls = 'warn'; }

    orb.classList.add(cls);
    orb.textContent = '●';
    coreLabel.textContent = 'AGENT CORE · ' + (v === 'PAYMENT_READY' ? 'ONLINE' : v);

    var pay = d.payment;
    var rows = [];
    if (pay) {
      rows.push(['X402', pay.x402 ? 'VERIFIED' : 'NO', pay.x402 ? 1 : 0]);
      rows.push(['PAYMENT', pay.challenge_valid ? 'READY' : 'INVALID', pay.challenge_valid ? 1 : 0]);
      rows.push(['NETWORK', pay.network || '—', pay.network ? 1 : 0.4]);
      rows.push(['ASSET', pay.asset || '—', pay.asset ? 1 : 0.4]);
      rows.push(['AMOUNT', pay.amount_usd != null ? '$' + pay.amount_usd : '—', 1]);
      rows.push(['LATENCY', (d.latency_ms != null ? d.latency_ms + 'ms' : '—'), 1]);
    }
    var bars = rows.map(function (r) {
      var w = Math.round((r[2] || 0) * 100);
      return '<div class="cosmic-bar"><span class="cosmic-bar-label">' + esc(r[0]) + '</span>' +
        '<span class="cosmic-bar-track"><span class="cosmic-bar-fill" style="width:' + w + '%"></span></span>' +
        '<span class="cosmic-bar-val">' + esc(r[1]) + '</span></div>';
    }).join('');

    var disc = d.discovery;
    var discRows = disc
      ? [['X402', disc.x402], ['OPENAPI', disc.openapi], ['AGENT.JSON', disc.agent_json], ['LLMS', disc.llms], ['ROBOTS', disc.robots]]
        .map(function (r) { return '<tr><td class="mono">' + esc(r[0]) + '</td><td>' + (r[1] ? '<span class="status-ok">found</span>' : '<span class="status-err">missing</span>') + '</td></tr>'; }).join('')
      : '<tr><td colspan="2">—</td></tr>';

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    result.innerHTML =
      '<div class="cosmic-verdict ' + cls + '">' + esc(title) + '</div>' +
      '<div class="cosmic-matrix">' +
        '<div class="cosmic-col"><h3 class="section-title">Payment / Health</h3><div class="cosmic-bars">' + bars + '</div></div>' +
        '<div class="cosmic-col"><h3 class="section-title">Discovery Matrix</h3><table class="data-table"><tbody>' + discRows + '</tbody></table></div>' +
      '</div>' +
      (notes ? '<div class="cosmic-notes"><h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul></div>' : '') +
      '<div class="cosmic-timing">TOTAL SCAN ' + (d.latency_ms != null ? d.latency_ms + 'ms' : '—') + '</div>';
  }

  function run() {
    var u = (urlEl.value || '').trim();
    if (!u) { setStatus('Enter a URL', false); return; }
    setStatus('Scanning…', true);
    var anim = animateScan();
    fetch('/api/agent-health/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: u }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        return anim.then(function () {
          if (!d || !d.ok) { setStatus((d && d.error) || 'Scan failed', false); return; }
          render(d.data);
          setStatus('OK · ' + d.data.verdict, true);
        });
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}