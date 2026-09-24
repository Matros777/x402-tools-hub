/**
 * Agent Registry — a live, stateless directory of agents/merchants.
 *
 * Free browser page. Its lookup endpoint
 * (/api/agent-registry/lookup) is intentionally NOT in the x402 TOOLS
 * table, so it stays open to humans. There is no database: the directory
 * is rebuilt on demand from seed wallets and their on-chain USDC
 * counterparties.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function agentRegistryPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "agent-registry",
    title: "Agent Registry",
    intro:
      "A live directory of agents and merchants, built on demand from seed wallets. It follows their USDC counterparties one hop on Base, scores each wallet with the Trust Layer, and ranks the result. No database — the chain is the registry.",

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="ar-seeds" class="input grow" type="text" placeholder="seed wallets, comma-separated 0x…" spellcheck="false" autocomplete="off">
          <select id="ar-limit" class="select">
            <option value="25">25 / seed</option>
            <option value="50" selected>50 / seed</option>
            <option value="100">100 / seed</option>
          </select>
          <button id="ar-run" class="btn btn-primary" type="button">Build registry</button>
        </div>
        <div id="ar-status" class="status" role="status"></div>
        <div id="ar-out"></div>
      </div>
    `,

    script: `
(function () {
  var seeds = document.getElementById('ar-seeds');
  var limit = document.getElementById('ar-limit');
  var btn = document.getElementById('ar-run');
  var status = document.getElementById('ar-status');
  var out = document.getElementById('ar-out');

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

  function render(d) {
    if (!d.entries || !d.entries.length) {
      out.innerHTML = '<p class="hint">No wallets discovered for these seeds.</p>';
      return;
    }
    var rows = d.entries.map(function (e, i) {
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="mono"><a href="' + esc(e.basescan) + '" target="_blank" rel="noopener">' + esc(short(e.address)) + '</a></td>' +
        '<td class="num">' + esc(e.score) + '/100</td>' +
        '<td><span class="tier-' + esc(e.tier) + '">' + esc(e.tier) + '</span></td>' +
        '<td class="num">' + esc(e.seen_as_counterparty_of) + '</td>' +
        '<td class="mono">' + esc(short(e.discovered_via)) + '</td>' +
        '</tr>';
    }).join('');

    var summary =
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Seeds</span><span class="ps-value">' + esc(d.total_seeds) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Discovered</span><span class="ps-value">' + esc(d.total_discovered) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Per-seed cap</span><span class="ps-value">' + esc(d.per_seed_limit) + '</span></div>' +
      '</div>';

    var table =
      '<table class="data-table"><thead><tr>' +
        '<th>#</th><th>Wallet</th><th>Score</th><th>Tier</th><th>Linked</th><th>Via</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    out.innerHTML = summary + table + (notes ? '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>' : '');
  }

  function run() {
    var raw = (seeds.value || '').trim();
    if (!raw) { setStatus('Enter at least one seed address', false); return; }
    var list = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var bad = list.filter(function (a) { return !/^0x[0-9a-fA-F]{40}$/.test(a); });
    if (bad.length) { setStatus('Invalid address: ' + bad[0], false); return; }

    setStatus('Building registry… (reads one hop per seed)', true);
    out.innerHTML = '';
    fetch('/api/agent-registry/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seeds: list, per_seed_limit: Number(limit.value || 50) }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Registry failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.total_discovered + ' wallets discovered', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  seeds.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}
