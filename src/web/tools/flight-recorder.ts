/**
 * Flight Recorder — the black box for x402 payments.
 *
 * Free browser page. The lookup endpoint it calls
 * (/api/flight-recorder/lookup) is intentionally NOT in the x402 TOOLS
 * table, so it stays open to humans. Data comes straight from Base via
 * Alchemy — no database, no cache.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function flightRecorderPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "flight-recorder",
    title: "Flight Recorder",
    intro:
      "The black box for x402 payments. Inspect every USDC transfer an address has received (or sent) on Base — amounts, counterparties and links to Basescan. Read live from the chain, with no database in between.",

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="fr-addr" class="input" type="text" placeholder="0x… wallet address" spellcheck="false" autocomplete="off">
          <select id="fr-dir" class="select">
            <option value="in">received (in)</option>
            <option value="out">sent (out)</option>
          </select>
          <select id="fr-limit" class="select">
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
          <button id="fr-run" class="btn btn-primary" type="button">Inspect</button>
        </div>
        <div id="fr-status" class="status" role="status"></div>
        <div id="fr-out"></div>
      </div>
    `,

    script: `
(function () {
  var addr = document.getElementById('fr-addr');
  var dir = document.getElementById('fr-dir');
  var limit = document.getElementById('fr-limit');
  var btn = document.getElementById('fr-run');
  var status = document.getElementById('fr-status');
  var out = document.getElementById('fr-out');

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
  function time(s) { return s ? new Date(s).toUTCString() : ''; }

  function render(d) {
    if (!d.count) {
      out.innerHTML = '<p class="hint">No USDC transfers found for this address in the chosen direction.</p>';
      return;
    }
    var rows = d.receipts.map(function (r) {
      var cp = d.direction === 'in' ? r.from : r.to;
      var link = r.basescan ? '<a href="' + esc(r.basescan) + '" target="_blank" rel="noopener">' + esc(short(r.tx_hash)) + '</a>' : '';
      return '<tr>' +
        '<td class="mono">' + esc(short(cp)) + '</td>' +
        '<td class="num">$' + esc(r.amount_usd.toFixed(6)) + '</td>' +
        '<td class="mono">' + esc(time(r.at)) + '</td>' +
        '<td class="mono">' + link + '</td>' +
        '</tr>';
    }).join('');

    var summary =
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Transfers</span><span class="ps-value">' + esc(d.count) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Total (USDC)</span><span class="ps-value">$' + esc(d.total_usd.toFixed(6)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Counterparties</span><span class="ps-value">' + esc(d.unique_counterparties) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">First seen</span><span class="ps-value small">' + esc(time(d.first_seen)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Last seen</span><span class="ps-value small">' + esc(time(d.last_seen)) + '</span></div>' +
      '</div>';

    var table =
      '<table class="data-table"><thead><tr>' +
        '<th>' + (d.direction === 'in' ? 'From' : 'To') + '</th>' +
        '<th>Amount</th><th>Time (UTC)</th><th>Tx</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

    out.innerHTML = summary + table;
  }

  function run() {
    var a = (addr.value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { setStatus('Enter a valid 0x address (40 hex chars)', false); return; }
    setStatus('Reading the chain…', true);
    out.innerHTML = '';
    fetch('/api/flight-recorder/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: a, direction: dir.value, limit: Number(limit.value || 50) }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Lookup failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.count + ' transfers', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}
