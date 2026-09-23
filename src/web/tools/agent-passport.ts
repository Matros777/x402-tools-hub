/**
 * Agent Passport — reputation score for any x402 payer wallet.
 *
 * Free browser page. The lookup endpoint it calls
 * (/api/agent-passport/lookup) is intentionally NOT in the x402 TOOLS
 * table, so it stays open to humans. Everything is derived from public
 * Base USDC history via Alchemy — no database, no accounts.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function agentPassportPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "agent-passport",
    title: "Agent Passport",
    intro:
      "A reputation passport for x402 payer wallets. We read an address's public USDC history on Base and distil it into a 0–100 Trust Score: age, volume, frequency, counterparty diversity and recency.",

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="ap-addr" class="input" type="text" placeholder="0x… agent wallet address" spellcheck="false" autocomplete="off">
          <button id="ap-run" class="btn btn-primary" type="button">Get passport</button>
        </div>
        <div id="ap-status" class="status" role="status"></div>
        <div id="ap-out"></div>
      </div>
    `,

    script: `
(function () {
  var addr = document.getElementById('ap-addr');
  var btn = document.getElementById('ap-run');
  var status = document.getElementById('ap-status');
  var out = document.getElementById('ap-out');

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
  function short(a) { return a ? a.slice(0, 8) + '…' + a.slice(-6) : ''; }
  function time(s) { return s ? new Date(s).toUTCString() : '—'; }
  function usd(n) { return '$' + (Number(n) || 0).toFixed(6); }

  function scoreColor(score) {
    if (score >= 80) return 'var(--ok)';
    if (score >= 60) return 'var(--accent)';
    if (score >= 40) return '#ffb454';
    if (score >= 20) return '#ff8a5c';
    return 'var(--err)';
  }

  function render(p) {
    var color = scoreColor(p.trust_score);

    var flags = (p.flags || []).map(function (f) {
      return '<span class="chip chip-warn">' + esc(f.message) + '</span>';
    }).join('') || '<span class="chip chip-ok">no warnings</span>';

    var recent = (p.recent_payments || []).map(function (r) {
      var link = r.basescan ? '<a href="' + esc(r.basescan) + '" target="_blank" rel="noopener">' + esc(short(r.tx_hash)) + '</a>' : esc(short(r.tx_hash));
      return '<tr>' +
        '<td class="mono">' + esc(short(r.to)) + '</td>' +
        '<td class="num">' + esc(usd(r.amount_usd)) + '</td>' +
        '<td class="mono">' + esc(time(r.at)) + '</td>' +
        '<td class="mono">' + link + '</td>' +
        '</tr>';
    }).join('');

    var recentBlock = recent
      ? '<h3 class="studio-sub">Recent payments</h3><table class="data-table"><thead><tr><th>To</th><th>Amount</th><th>Time (UTC)</th><th>Tx</th></tr></thead><tbody>' + recent + '</tbody></table>'
      : '<p class="hint">No outgoing USDC payments found on Base.</p>';

    out.innerHTML =
      '<div class="passport-head">' +
        '<div class="passport-score" style="border-color:' + color + '">' +
          '<span class="score-num" style="color:' + color + '">' + esc(p.trust_score) + '</span>' +
          '<span class="score-max">/100</span>' +
          '<span class="score-tier">' + esc(p.tier) + '</span>' +
        '</div>' +
        '<div class="passport-meta">' +
          '<div class="mono addr-line">' + esc(p.address) + '</div>' +
          '<div class="chips">' + flags + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Total paid</span><span class="ps-value">' + esc(usd(p.total_paid_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Payments</span><span class="ps-value">' + esc(p.tx_count) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Avg payment</span><span class="ps-value">' + esc(usd(p.avg_payment_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Merchants</span><span class="ps-value">' + esc(p.merchants_count) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Wallet age</span><span class="ps-value">' + esc(p.wallet_age_days == null ? '—' : p.wallet_age_days + ' d') + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">First seen</span><span class="ps-value small">' + esc(time(p.first_seen)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Last seen</span><span class="ps-value small">' + esc(time(p.last_seen)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Last merchant</span><span class="ps-value small mono">' + esc(p.last_merchant ? short(p.last_merchant) : '—') + '</span></div>' +
      '</div>' +
      recentBlock;
  }

  function run() {
    var a = (addr.value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { setStatus('Enter a valid 0x address (40 hex chars)', false); return; }
    setStatus('Reading the chain…', true);
    out.innerHTML = '';
    fetch('/api/agent-passport/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: a }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Lookup failed', false); return; }
        render(d.data);
        setStatus('OK · trust score ' + d.data.trust_score + '/100', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}
