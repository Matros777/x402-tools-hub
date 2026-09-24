/**
 * Agent Route — task-to-tool planner over the hub catalog.
 *
 * Free browser page. Its lookup endpoint (/api/agent-route/lookup) is
 * intentionally NOT in the x402 TOOLS table, so it stays open to humans.
 * The paid endpoint (POST /api/agent-route) is the same payload for
 * agents at $0.003 USDC per call.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function agentRoutePage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "agent-route",
    title: "Agent Route",
    intro:
      "Tell the planner what your agent needs to do, and it picks the optimal sequence of hub tools — with per-step reasons, prices, a budget check and a feasibility verdict. No LLM needed: it scores every hub tool against your task.",

    howToUse: [
      "Describe the task in plain words (e.g. “find BTC price and analyze”).",
      "Optionally set a USDC budget and a max number of steps.",
      "Optionally pass a wallet address to get a trust-check note.",
      "Read the route: tools, reasons, cost, and whether it fits the budget.",
      "Agents call the paid POST /api/agent-route endpoint for the same logic.",
    ],
    useCases: [
      "An agent deciding which hub APIs to call for a compound task.",
      "Budget-aware planning before spending USDC on a multi-step workflow.",
      "Auto-discovery of the right tools for a natural-language request.",
      "Pairing with Agent Intelligence: route first, then trust-check counterparties.",
    ],

    body: `
      <div class="studio">
        <div class="query-row">
          <label class="field-label">Task (plain words)
            <input id="ar-task" class="input" type="text" placeholder="e.g. Find the current BTC price and analyze whether there is a bullish setup" maxlength="400" autocomplete="off">
          </label>
        </div>
        <div class="query-row">
          <label class="field-label">Budget (USDC, optional)
            <input id="ar-budget" class="input" type="number" min="0" step="0.001" placeholder="e.g. 0.05">
          </label>
          <label class="field-label">Max steps
            <input id="ar-steps" class="input" type="number" min="1" max="8" step="1" value="3">
          </label>
          <label class="field-label">Wallet (optional, trust note)
            <input id="ar-wallet" class="input" type="text" placeholder="0x…" spellcheck="false" autocomplete="off">
          </label>
          <label class="field-label">Mode
            <select id="ar-mode" class="select">
              <option value="plan">plan</option>
              <option value="discover">discover</option>
              <option value="estimate">estimate</option>
            </select>
          </label>
        </div>
        <div class="query-row">
          <button id="ar-run" class="btn btn-primary" type="button">Route</button>
        </div>
        <div id="ar-status" class="status" role="status"></div>
        <div id="ar-out"></div>
      </div>
    `,

    script: `
(function () {
  var taskEl = document.getElementById('ar-task');
  var budgetEl = document.getElementById('ar-budget');
  var stepsEl = document.getElementById('ar-steps');
  var walletEl = document.getElementById('ar-wallet');
  var modeEl = document.getElementById('ar-mode');
  var btn = document.getElementById('ar-run');
  var status = document.getElementById('ar-status');
  var out = document.getElementById('ar-out');

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
  function money(n) { return '$' + Number(n || 0).toFixed(4); }

  function render(r) {
    var steps = (r.steps || []).map(function (s) {
      return '<tr>' +
        '<td class="num">' + s.step + '</td>' +
        '<td class="mono">' + esc(s.tool) + '</td>' +
        '<td>' + esc(s.reason) + '</td>' +
        '<td class="mono">' + esc(s.input_hint) + '</td>' +
        '<td class="num">' + esc(money(s.cost_usd)) + '</td>' +
        '</tr>';
    }).join('');

    var vclass = r.possible ? 'verdict-ok' : 'verdict-err';
    var blocks = [];
    blocks.push('<h3 class="section-title">Verdict</h3><div class="verdict ' + vclass + '">' + (r.possible ? 'POSSIBLE' : 'NOT FEASIBLE') + '</div>');

    blocks.push('<h3 class="section-title">Route</h3>');
    blocks.push(steps
      ? '<table class="data-table"><thead><tr><th>#</th><th>Tool</th><th>Reason</th><th>Input</th><th>Cost</th></tr></thead><tbody>' + steps + '</tbody></table>'
      : '<p class="hint">No tools matched — try rephrasing the task.</p>');

    blocks.push('<h3 class="section-title">Cost</h3>');
    blocks.push('<div class="passport-grid">' +
      '<div class="passport-stat"><span class="ps-label">Estimated</span><span class="ps-value">' + esc(money(r.estimated_cost_usd)) + '</span></div>' +
      (r.budget_usdc !== null
        ? '<div class="passport-stat"><span class="ps-label">Budget</span><span class="ps-value">' + esc(money(r.budget_usdc)) + '</span></div>' +
          '<div class="passport-stat"><span class="ps-label">Remaining</span><span class="ps-value">' + esc(money(r.budget_remaining_usdc)) + '</span></div>'
        : '') +
      (r.trust ? '<div class="passport-stat"><span class="ps-label">Trust</span><span class="ps-value">' + esc(r.trust.tier) + '</span></div>' : '') +
      '</div>');

    if ((r.notes || []).length) {
      blocks.push('<h3 class="section-title">Notes</h3><ul class="flag-list">' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>');
    }

    out.innerHTML = blocks.join('');
  }

  function run() {
    var t = (taskEl.value || '').trim();
    if (!t) { setStatus('Describe the task first', false); return; }
    var payload = {
      task: t,
      max_steps: Number(stepsEl.value) || 3,
      mode: modeEl.value,
    };
    var b = (budgetEl.value || '').trim();
    if (b !== '') payload.budget_usdc = Number(b);
    var w = (walletEl.value || '').trim();
    if (w !== '') payload.wallet = w;

    setStatus('Routing…', true);
    out.innerHTML = '';
    fetch('/api/agent-route/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Routing failed', false); return; }
        render(d.data);
        setStatus('OK · ' + d.data.steps.length + ' steps · ' + money(d.data.estimated_cost_usd), true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  taskEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`,
  });
}