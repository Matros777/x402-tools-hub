/**
 * Payment Decoder — parse a raw PAYMENT-REQUIRED header or challenge body.
 *
 * Free browser page. Its lookup endpoint (/api/payment-decoder/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/payment-decoder) is the same payload for
 * agents. Pure local parsing — no outbound network request.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function paymentDecoderPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "payment-decoder",
    title: "Payment Decoder",
    intro:
      "Paste a raw PAYMENT-REQUIRED header (base64) or a 402 challenge body and get the structured fields back: scheme, network, asset, amount, payTo, resource, deadline and extra. A pure local parse — nothing leaves your browser or the worker.",

    howToUse: [
      "Copy the PAYMENT-REQUIRED header or the 402 JSON body from any endpoint.",
      "Paste it into the field.",
      "Decode — see the structured payment requirements.",
      "Check the field-validity flag (challenge_valid = fields, not signature).",
      "Agents call the paid POST /api/payment-decoder endpoint ($0.001).",
    ],
    useCases: [
      "Understanding a challenge before deciding to pay.",
      "Feeding raw 402 output from 402 Probe into a structured form.",
      "Auditing what a service really requires (asset, network, payTo).",
      "Building payment payloads from decoded requirements.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <textarea id="pd-input" class="editor" rows="6" spellcheck="false" placeholder="PAYMENT-REQUIRED header (base64) or 402 JSON body…"></textarea>
        </div>
        <div class="query-row">
          <button id="pd-run" class="btn btn-primary" type="button">Decode</button>
        </div>
        <div id="pd-status" class="status" role="status"></div>
        <div id="pd-out"></div>
      </div>
    `,

    script: `
(function () {
  var input = document.getElementById('pd-input');
  var btn = document.getElementById('pd-run');
  var status = document.getElementById('pd-status');
  var out = document.getElementById('pd-out');

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
      ['Parsed', d.parsed ? 'yes' : 'no'],
      ['x402Version', d.x402_version],
      ['Resource', d.resource_url],
      ['Description', d.description],
      ['Scheme', d.scheme],
      ['Network', d.network],
      ['Asset', d.asset],
      ['Amount (atomic)', d.amount_atomic],
      ['Amount (USD)', d.amount_usd != null ? '$' + d.amount_usd : null],
      ['payTo', d.pay_to],
      ['Max timeout', d.max_timeout_seconds],
      ['Deadline', d.deadline],
    ].map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td class="mono">' + esc(r[1] == null ? '—' : r[1]) + '</td></tr>';
    }).join('');

    var fields = Object.entries(d.fields_valid || {}).map(function (e) {
      return '<tr><td class="mono">' + esc(e[0]) + '</td><td>' + (e[1] ? '<span class="status-ok">ok</span>' : '<span class="status-err">bad</span>') + '</td></tr>';
    }).join('');

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    out.innerHTML =
      '<h3 class="section-title">Fields</h3>' +
      '<table class="data-table"><tbody>' + rows + '</tbody></table>' +
      '<h3 class="section-title">Field validity</h3>' +
      '<table class="data-table"><tbody>' + fields + '</tbody></table>' +
      (notes ? '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>' : '');
  }

  function run() {
    var v = (input.value || '').trim();
    if (!v) { setStatus('Paste a PAYMENT-REQUIRED header or body', false); return; }
    setStatus('Decoding…', true);
    out.innerHTML = '';
    fetch('/api/payment-decoder/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: v }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Decode failed', false); return; }
        render(d.data);
        setStatus('OK · parsed=' + d.data.parsed, true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
})();
`,
  });
}
