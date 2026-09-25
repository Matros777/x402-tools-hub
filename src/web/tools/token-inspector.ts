/**
 * Token Inspector — free browser page.
 *
 * Free lookup endpoint (/api/token-inspector/lookup) stays open to humans
 * because it is NOT in the x402 TOOLS table. The paid endpoint
 * (POST /api/token-inspector) is the same payload for agents, $0.001.
 *
 * One question answered: "What is this token contract?"
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function tokenInspectorPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "token-inspector",
    title: "Token Inspector",
    intro:
      "Fact-only identity for a Base token contract: is it a contract or an EOA, is it ERC-20 or ERC-721, what are its name, symbol, decimals, total supply and owner? One call, one answer — no price, no holders, no risk score, no history.",

    howToUse: [
      "Paste a Base token contract address (0x + 40 hex chars).",
      "Chain is fixed to base (Base mainnet).",
      "Run — read is_contract, standard, name, symbol, decimals, total_supply and owner.",
      "Owner 0x0000…0000 means ownership was renounced.",
      "Agents call the paid POST /api/token-inspector endpoint ($0.001).",
    ],
    useCases: [
      "Check whether an address is a token contract or a plain wallet.",
      "Verify decimals/symbol before formatting an amount.",
      "Tell an ERC-20 apart from an ERC-721 collection.",
      "Spot a fake USDC by comparing name, symbol and decimals.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="ti-addr" class="input" type="text" placeholder="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" spellcheck="false" autocomplete="off">
          <button id="ti-run" class="btn btn-primary" type="button">Inspect</button>
        </div>
        <div id="ti-status" class="status" role="status"></div>
        <div id="ti-out"></div>
      </div>
    `,

    script: `
(function () {
  var addrEl = document.getElementById('ti-addr');
  var btn = document.getElementById('ti-run');
  var status = document.getElementById('ti-status');
  var out = document.getElementById('ti-out');

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
      ['address', d.address],
      ['chain', d.chain],
      ['valid', d.valid ? 'yes' : 'no'],
      ['is_contract', d.is_contract === null ? '—' : (d.is_contract ? 'yes' : 'no (EOA)')],
      ['standard', d.standard],
      ['name', d.name],
      ['symbol', d.symbol],
      ['decimals', d.decimals],
      ['total_supply', d.total_supply],
      ['owner', d.owner],
      ['source', d.source],
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
    var address = (addrEl.value || '').trim();
    if (!address) { setStatus('Enter a token contract address', false); return; }
    setStatus('Inspecting…', true);
    out.innerHTML = '';
    fetch('/api/token-inspector/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: address, chain: 'base' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Inspect failed', false); return; }
        render(d.data);
        var summary = d.data.symbol ? (d.data.symbol + (d.data.standard ? ' · ' + d.data.standard : '')) : 'OK';
        setStatus('OK · ' + summary, d.data.ok);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  addrEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}
