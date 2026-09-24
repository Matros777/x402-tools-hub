/**
 * x402 Simulate — cost modelling for x402 workloads.
 *
 * Free browser page. Pure client-side + a stateless lookup endpoint
 * (/api/x402-simulate/lookup) that is NOT in the x402 TOOLS table, so it
 * stays open to humans. No network, no chain, no database.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function x402SimulatePage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "x402-simulate",
    title: "x402 Simulate",
    intro:
      "Model the cost of an x402 workload before you run it. Add call groups with a price and a count, optionally compare against a flat subscription, and see the true effective price per call including network overhead and a break-even point.",

    body: `
      <div class="studio">
        <div class="query-row">
          <label class="field-label">Subscription (USD, optional)
            <input id="xs-sub" class="input" type="number" min="0" step="0.01" placeholder="e.g. 49" value="">
          </label>
          <label class="field-label">Network fee / call (USD)
            <input id="xs-net" class="input" type="number" min="0" step="0.0001" value="0.0001">
          </label>
        </div>

        <div id="xs-rows"></div>

        <div class="query-row">
          <button id="xs-add" class="btn" type="button">+ Add call group</button>
          <button id="xs-run" class="btn btn-primary" type="button">Simulate</button>
        </div>
        <div id="xs-status" class="status" role="status"></div>
        <div id="xs-out"></div>
      </div>
    `,

    script: `
(function () {
  var rows = document.getElementById('xs-rows');
  var sub = document.getElementById('xs-sub');
  var net = document.getElementById('xs-net');
  var addBtn = document.getElementById('xs-add');
  var runBtn = document.getElementById('xs-run');
  var status = document.getElementById('xs-status');
  var out = document.getElementById('xs-out');
  var seq = 0;

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

  function addRow(name, price, count) {
    seq += 1;
    var id = seq;
    var wrap = document.createElement('div');
    wrap.className = 'query-row xs-row';
    wrap.setAttribute('data-id', String(id));
    wrap.innerHTML =
      '<input class="input xs-name" type="text" placeholder="tool name" value="' + esc(name || '') + '">' +
      '<input class="input xs-price" type="number" min="0" step="0.0001" placeholder="price $" value="' + esc(price == null ? '' : price) + '">' +
      '<input class="input xs-count" type="number" min="0" step="1" placeholder="count" value="' + esc(count == null ? '1' : count) + '">' +
      '<button class="btn xs-del" type="button" title="remove">×</button>';
    wrap.querySelector('.xs-del').addEventListener('click', function () { wrap.remove(); });
    rows.appendChild(wrap);
  }

  function collect() {
    var calls = [];
    var nodes = rows.querySelectorAll('.xs-row');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var name = n.querySelector('.xs-name').value.trim();
      var price = Number(n.querySelector('.xs-price').value || 0);
      var count = Number(n.querySelector('.xs-count').value || 0);
      calls.push({ name: name || ('call-' + (i + 1)), price_usd: price, count: count });
    }
    return calls;
  }

  function render(d) {
    var lines = d.lines.map(function (l) {
      return '<tr>' +
        '<td>' + esc(l.name) + '</td>' +
        '<td class="num">' + esc(money(l.price_usd)) + '</td>' +
        '<td class="num">' + esc(l.count) + '</td>' +
        '<td class="num">' + esc(money(l.subtotal_usd)) + '</td>' +
        '</tr>';
    }).join('');

    var summary =
      '<div class="passport-grid">' +
        '<div class="passport-stat"><span class="ps-label">Total calls</span><span class="ps-value">' + esc(d.total_calls) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">API cost</span><span class="ps-value">' + esc(money(d.api_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Network cost</span><span class="ps-value">' + esc(money(d.network_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Total cost</span><span class="ps-value">' + esc(money(d.total_cost_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Effective / call</span><span class="ps-value">' + esc(money(d.effective_price_per_call_usd)) + '</span></div>' +
        '<div class="passport-stat"><span class="ps-label">Overhead</span><span class="ps-value">' + esc((d.overhead_ratio * 100).toFixed(2)) + '%</span></div>' +
      '</div>';

    var compare = '';
    if (d.subscription_usd != null) {
      compare =
        '<h3 class="section-title">Vs subscription</h3>' +
        '<div class="passport-grid">' +
          '<div class="passport-stat"><span class="ps-label">Subscription</span><span class="ps-value">' + esc(money(d.subscription_usd)) + '</span></div>' +
          '<div class="passport-stat"><span class="ps-label">Savings (sub - x402)</span><span class="ps-value">' + esc(money(d.savings_vs_subscription_usd)) + '</span></div>' +
          '<div class="passport-stat"><span class="ps-label">x402 cheaper?</span><span class="ps-value">' + (d.cheaper_than_subscription ? 'yes' : 'no') + '</span></div>' +
          '<div class="passport-stat"><span class="ps-label">Break-even calls</span><span class="ps-value">' + (d.break_even_calls == null ? '—' : esc(d.break_even_calls)) + '</span></div>' +
        '</div>';
    }

    var notes = (d.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    var table = lines
      ? '<h3 class="section-title">Breakdown</h3><table class="data-table"><thead><tr>' +
        '<th>Call group</th><th>Price</th><th>Count</th><th>Subtotal</th>' +
        '</tr></thead><tbody>' + lines + '</tbody></table>'
      : '';

    out.innerHTML = summary + compare + table + (notes ? '<h3 class="section-title">Notes</h3><ul class="flag-list">' + notes + '</ul>' : '');
  }

  function run() {
    var calls = collect();
    if (calls.length === 0) { setStatus('Add at least one call group', false); return; }
    var payload = { calls: calls };
    var s = sub.value.trim();
    if (s !== '') payload.subscription_usd = Number(s);
    var nf = net.value.trim();
    if (nf !== '') payload.network_fee_usd = Number(nf);

    setStatus('Calculating…', true);
    out.innerHTML = '';
    fetch('/api/x402-simulate/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Simulation failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.total_calls + ' calls · ' + money(d.data.total_cost_usd), true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  addBtn.addEventListener('click', function () { addRow('', '', 1); });
  runBtn.addEventListener('click', run);

  // Two sensible starting rows.
  addRow('wallet-intel', 0.001, 100);
  addRow('agent-passport', 0.001, 200);
})();
`,
  });
}
