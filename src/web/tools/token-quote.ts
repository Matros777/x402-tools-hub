/**
 * Token Quote — fact-only price quote for a token id or contract address.
 *
 * Free browser page. Its lookup endpoint (/api/token-quote/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/token-quote) is the same payload for
 * agents. Single source, no buy/sell, no verdict, no history.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function tokenQuotePage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "token-quote",
    title: "Token Quote",
    intro:
      "A single-source, fact-only quote for a token symbol or contract address. Returns price, 24h change, source and timestamp. No buy/sell advice, no verdict, no history — just the number an agent can budget with.",

    howToUse: [
      "Enter a token symbol (ETH, USDC, DOGE) or a Base contract address.",
      "Optionally choose the quote currency (default USD).",
      "Run — read price, 24h change, source and timestamp.",
      "Base USDC resolves to $1 via known peg.",
      "Agents call the paid POST /api/token-quote endpoint ($0.001).",
    ],
    useCases: [
      "Budgeting a payment in USDC terms.",
      "Checking a token price before deciding whether a micro-payment is viable.",
      "A fact-only price feed for agent routing.",
      "Verifying USDC-peg assumption for Base addresses.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="tq-id" class="input" type="text" placeholder="ETH / USDC / 0x8335…" spellcheck="false" autocomplete="off">
          <button id="tq-run" class="btn btn-primary" type="button">Quote</button>
        </div>
        <div id="tq-status" class="status" role="status"></div>
        <div id="tq-out"></div>
      </div>
    `,

    script: `
(function () {
  var idEl = document.getElementById('tq-id');
  var btn = document.getElementById('tq-run');
  var status = document.getElementById('tq-status');
  var out = document.getElementById('tq-out');

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
    var rows = [
      ['id', d.id],
      ['address', d.address],
      ['vs', d.vs],
      ['price', d.price != null ? '$' + d.price : '—'],
      ['change_24h', d.change_24h != null ? d.change_24h + '%' : '—'],
      ['source', d.source],
      ['as_of', d.as_of],
      ['ok', d.ok ? 'yes' : 'no'],
    ].map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td class="mono">' + esc(r[1] == null ? '—' : r[1]) + '</td></tr>';
    }).join('');

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    out.innerHTML =
      '<table class="data-table"><tbody>' + rows + '</tbody></table>' +
      (notes ? '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>' : '');
  }

  function run() {
    var id = (idEl.value || '').trim();
    if (!id) { setStatus('Enter a token id or address', false); return; }
    setStatus('Quoting…', true);
    out.innerHTML = '';
    fetch('/api/token-quote/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: id, vs: 'USD' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Quote failed', false); return; }
        render(d.data);
        setStatus('OK · ' + (d.data.price != null ? '$' + d.data.price : 'no quote'), d.data.ok);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  idEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}