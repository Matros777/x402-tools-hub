/**
 * Merchant Trust — reputation profile for a receiving wallet.
 *
 * Free browser page. Its lookup endpoint
 * (/api/merchant-trust/lookup) is intentionally NOT in the x402 TOOLS
 * table, so it stays open to humans. Data comes straight from Base via
 * Alchemy — no database, no cache.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function merchantTrustPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "merchant-trust",
    title: "Merchant Trust",
    intro:
      "Reputation for a merchant wallet. Scores how much USDC a receiver has collected on Base, from how many distinct payers, how often, how recently — and flags concentration risk. Read live from the chain, no database in between.",

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="mt-addr" class="input" type="text" placeholder="0x… merchant wallet" spellcheck="false" autocomplete="off">
          <button id="mt-run" class="btn btn-primary" type="button">Score merchant</button>
        </div>
        <div id="mt-status" class="status" role="status"></div>
        <div id="mt-out"></div>
      </div>
    `,

    script: `
(function () {
  var addr = document.getElementById('mt-addr');
  var btn = document.getElementById('mt-run');
  var status = document.getElementById('mt-status');
  var out = document.getElementById('mt-out');

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
  function time(s) { return s ? new Date(s).toUTCString() : '—'; }
  function money(n) { return '$' + Number(n || 0).toFixed(6); }
  function pct(n) { return (Number(n || 0) * 100).toFixed(1) + '%'; }

  function render(d) {
    var flags = (d.flags || []).map(function (f) {
      return '<li><code>' + esc(f.code) + '</code> — ' + esc(f.message) + '</li>';
    }).join('');

    var payers = (d.top_payers || []).map(function (p, i) {
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="mono"><a href="https://basescan.org/address/' + esc(p.address) + '" target="_blank" rel="noopener">' + esc(short(p.address)) + '</a></td>' +
        '<td class="num">' + esc(money(p.total_usd)) + '</td>' +
        '<td class="num">' + esc(p.tx_count) + '</td>' +
        '<td class="mono">' + esc(time(p.last_seen)) + '</td>' +
        '</tr>';
    }).join('');

    var summary =
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Score</span><span class="ps-value">' + esc(d.merchant_score) + '/100</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Tier</span><span class="ps-value tier-' + esc(d.tier) + '">' + esc(d.tier) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Total received</span><span class="ps-value">' + esc(money(d.total_received_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Payments</span><span class="ps-value">' + esc(d.tx_count) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Avg payment</span><span class="ps-value">' + esc(money(d.avg_payment_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Max payment</span><span class="ps-value">' + esc(money(d.max_payment_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Payers</span><span class="ps-value">' + esc(d.payers_count) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Top payer share</span><span class="ps-value">' + esc(pct(d.top_payer_share)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">First seen</span><span class="ps-value small">' + esc(time(d.first_seen)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Last seen</span><span class="ps-value small">' + esc(time(d.last_seen)) + '</span></div>' +
      '</div>';

    var flagsBlock = flags
      ? '<h3 class="section-title">Flags</h3><ul class="flag-list">' + flags + '</ul>'
      : '<p class="hint">No flags — clean profile.</p>';

    var payersTable = payers
      ? '<h3 class="section-title">Top payers</h3><table class="data-table"><thead><tr>' +
        '<th>#</th><th>Wallet</th><th>Total</th><th>Payments</th><th>Last seen (UTC)</th>' +
        '</tr></thead><tbody>' + payers + '</tbody></table>'
      : '';

    out.innerHTML = summary + flagsBlock + payersTable;
  }

  function run() {
    var a = (addr.value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { setStatus('Enter a valid 0x address (40 hex chars)', false); return; }
    setStatus('Reading the chain…', true);
    out.innerHTML = '';
    fetch('/api/merchant-trust/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: a }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Lookup failed', false); return; }
        render(d.data);
        setStatus('OK · score ' + d.data.merchant_score + '/100 (' + d.data.tier + ')', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}
