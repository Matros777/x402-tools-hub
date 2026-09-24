/**
 * Address Toolkit — validate, checksum and describe EVM addresses.
 *
 * Free browser page. Its lookup endpoint (/api/address-toolkit/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * Uses wallet-intel-core validation + EIP-55 checksum (pure JS) and an
 * optional Alchemy type check (EOA vs contract).
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function addressToolkitPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "address-toolkit",
    title: "Address Toolkit",
    intro:
      "Paste any EVM address to get it normalized, EIP-55 checksummed, and described — is it a wallet or a contract, lowercase or checksummed, and a Basescan link. Pure in-browser validation plus an optional live type check.",

    howToUse: [
      "Paste an address into the field.",
      "Click Inspect to normalize, checksum and (optionally) classify it.",
      "Copy the checksum form or open Basescan.",
      "Agents can use the paid POST /api/address-toolkit endpoint.",
    ],
    useCases: [
      "Catching checksum errors before a payment is signed.",
      "Converting between lowercase and EIP-55 forms.",
      "Checking whether an address is a contract before interacting.",
      "Building tools that consume x402 payTo addresses safely.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <input id="at-addr" class="input" type="text" placeholder="0x…" spellcheck="false" autocomplete="off">
          <button id="at-run" class="btn btn-primary" type="button">Inspect</button>
        </div>
        <div id="at-status" class="status" role="status"></div>
        <div id="at-out"></div>
      </div>
    `,

    script: `
(function () {
  var addr = document.getElementById('at-addr');
  var btn = document.getElementById('at-run');
  var status = document.getElementById('at-status');
  var out = document.getElementById('at-out');

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
    if (!d.valid) {
      out.innerHTML = '<p class="hint">Not a valid 20-byte EVM address.</p>';
      return;
    }
    var type = d.type === 'contract' ? 'contract' : d.type === 'eoa' ? 'EOA (wallet)' : 'unknown';
    var rows =
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Valid</span><span class="ps-value">yes</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Type</span><span class="ps-value">' + esc(type) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Checksum OK</span><span class="ps-value">' + (d.is_checksum ? 'yes' : 'no') + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Lowercase</span><span class="ps-value">' + (d.is_lowercase ? 'yes' : 'no') + '</span></div>' +
      '</div>' +
      '<h3 class="section-title">Forms</h3>' +
      '<table class="data-table"><tbody>' +
        '<tr><th>Normalized</th><td class="mono">' + esc(d.address) + '</td></tr>' +
        '<tr><th>Checksum (EIP-55)</th><td class="mono">' + esc(d.checksum) + '</td></tr>' +
        '<tr><th>Basescan</th><td class="mono"><a href="' + esc(d.basescan) + '" target="_blank" rel="noopener">' + esc(d.basescan) + '</a></td></tr>' +
      '</tbody></table>';

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    out.innerHTML = rows + (notes ? '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>' : '');
  }

  function run() {
    var a = (addr.value || '').trim();
    if (!a) { setStatus('Enter an address', false); return; }
    setStatus('Inspecting…', true);
    out.innerHTML = '';
    fetch('/api/address-toolkit/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: a }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Inspect failed', false); return; }
        render(d.data);
        setStatus(d.data.valid ? 'OK · ' + (d.data.type || 'unknown') : 'Invalid address', d.data.valid);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}