/**
 * Base Gas — live gas price and transaction cost estimator for Base.
 *
 * Free browser page. Its lookup endpoint (/api/base-gas/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * Uses Alchemy eth_gasPrice when configured, else static fallbacks.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function baseGasPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "base-gas",
    title: "Base Gas",
    intro:
      "Live gas price on Base and what a transfer or a contract call actually costs in USD. Handy when deciding whether an x402 micropayment is worth it — or for feeding a more accurate network fee into x402 Simulate.",

    howToUse: [
      "Click Check to read the current gas price from Base.",
      "See the cost of a USDC transfer and a typical contract call.",
      "Optionally enter your own gas limit to estimate custom calls.",
      "Use the number in your own x402 cost model.",
    ],
    useCases: [
      "Deciding whether a $0.001 payment is viable given current gas.",
      "Budgeting an agent workload with live network costs.",
      "Comparing x402-on-Base vs alternative rails.",
      "Agents fetching gas via the paid POST /api/base-gas endpoint.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <label class="field-label">Custom gas limit (optional)
            <input id="bg-gas" class="input" type="number" min="21000" step="1000" placeholder="21000">
          </label>
          <button id="bg-run" class="btn btn-primary" type="button">Check gas</button>
        </div>
        <div id="bg-status" class="status" role="status"></div>
        <div id="bg-out"></div>
      </div>
    `,

    script: `
(function () {
  var gasEl = document.getElementById('bg-gas');
  var btn = document.getElementById('bg-run');
  var status = document.getElementById('bg-status');
  var out = document.getElementById('bg-out');

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
  function money(n) { return '$' + Number(n || 0).toFixed(6); }
  function gwei(n) { return Number(n || 0).toFixed(4) + ' gwei'; }

  function render(d) {
    var custom = (d.custom || []).map(function (c) {
      return '<tr><td class="num">' + esc(c.gas_limit) + '</td><td class="num">' + esc(money(c.cost_usd)) + '</td></tr>';
    }).join('');

    out.innerHTML =
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Gas price</span><span class="ps-value">' + esc(gwei(d.total_gwei)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Block</span><span class="ps-value">' + esc(d.block_number == null ? '—' : d.block_number) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">USDC transfer</span><span class="ps-value">' + esc(money(d.transfer_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Contract call</span><span class="ps-value">' + esc(money(d.call_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">ETH price</span><span class="ps-value">' + esc(money(d.eth_usd)) + '</span></div>' +
      '</div>' +
      (custom ? '<h3 class="section-title">Custom gas limits</h3><table class="data-table"><thead><tr><th>Gas limit</th><th>Cost (USD)</th></tr></thead><tbody>' + custom + '</tbody></table>' : '');

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    if (notes) out.innerHTML += '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>';
  }

  function run() {
    var customGas = (gasEl.value || '').trim();
    var payload = {};
    if (customGas !== '') payload.gas_limit = Number(customGas);

    setStatus('Reading Base gas…', true);
    out.innerHTML = '';
    fetch('/api/base-gas/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Gas check failed', false); return; }
        render(d.data);
        setStatus('OK · gas ' + gwei(d.data.total_gwei), true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  gasEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}