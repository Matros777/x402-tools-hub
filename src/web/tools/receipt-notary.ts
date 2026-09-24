/**
 * Receipt Notary — compact, verifiable receipt for a paid call.
 *
 * Free browser page. Its lookup endpoint (/api/receipt-notary/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/receipt-notary) is the same payload for
 * agents. No outbound payment, no refetch of the resource.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function receiptNotaryPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "receipt-notary",
    title: "Receipt Notary",
    intro:
      "Notarize a paid response into a compact receipt: SHA-256 of the body (or your pre-computed hash), UTC timestamp, resource and payment tx. Bodies up to 64KB are hashed server-side and cross-checked against a provided sha256; larger bodies get a 413 asking you to send only the hash.",

    howToUse: [
      "Paste the resource URL you paid for and, optionally, the payment tx hash.",
      "Paste the response body (up to 64KB) or a pre-computed sha256.",
      "Notarize — the server hashes and cross-checks.",
      "Save the receipt_id + sha256 + timestamp as your proof.",
      "Agents call the paid POST /api/receipt-notary endpoint ($0.001).",
    ],
    useCases: [
      "Keeping a verifiable record of a paid API response.",
      "Providing a receipt for audit or reimbursement.",
      "Storing the hash of a response without keeping the full body.",
      "An agent logging its spend trail across the hub.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <label class="field-label">Resource URL
            <input id="rn-resource" class="input" type="text" placeholder="https://…" spellcheck="false" autocomplete="off">
          </label>
          <label class="field-label">Payment tx (optional)
            <input id="rn-tx" class="input" type="text" placeholder="0x…" spellcheck="false" autocomplete="off">
          </label>
        </div>
        <div class="query-row">
          <label class="field-label">Body (optional, ≤64KB)
            <textarea id="rn-body" class="editor" rows="4" spellcheck="false" placeholder="Response body…"></textarea>
          </label>
          <label class="field-label">Or sha256 (optional)
            <input id="rn-sha" class="input" type="text" placeholder="sha256 hex…" spellcheck="false" autocomplete="off">
          </label>
        </div>
        <div class="query-row">
          <button id="rn-run" class="btn btn-primary" type="button">Notarize</button>
        </div>
        <div id="rn-status" class="status" role="status"></div>
        <div id="rn-out"></div>
      </div>
    `,

    script: `
(function () {
  var resEl = document.getElementById('rn-resource');
  var txEl = document.getElementById('rn-tx');
  var bodyEl = document.getElementById('rn-body');
  var shaEl = document.getElementById('rn-sha');
  var btn = document.getElementById('rn-run');
  var status = document.getElementById('rn-status');
  var out = document.getElementById('rn-out');

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
      ['receipt_id', d.receipt_id],
      ['sha256', d.sha256],
      ['timestamp', d.timestamp],
      ['resource', d.resource],
      ['tx', d.tx],
      ['bytes', d.bytes],
      ['match', d.match],
    ].map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td class="mono">' + esc(r[1] == null ? '—' : r[1]) + '</td></tr>';
    }).join('');
    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    out.innerHTML =
      '<table class="data-table"><tbody>' + rows + '</tbody></table>' +
      (notes ? '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>' : '');
  }

  function run() {
    var payload = {};
    var r = (resEl.value || '').trim();
    if (r) payload.resource = r;
    var t = (txEl.value || '').trim();
    if (t) payload.payment_tx = t;
    var b = (bodyEl.value || '');
    if (b) payload.body = b;
    var s = (shaEl.value || '').trim();
    if (s) payload.sha256 = s;
    if (!payload.body && !payload.sha256) { setStatus('Provide a body or a sha256', false); return; }

    setStatus('Notarizing…', true);
    out.innerHTML = '';
    fetch('/api/receipt-notary/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Notary failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.receipt_id, true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
})();
`,
  });
}