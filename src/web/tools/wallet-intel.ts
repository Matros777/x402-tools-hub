/**
 * x402 Tools Hub — Wallet Intel page
 *
 * Client-side UI for the on-chain wallet snapshot (Base mainnet).
 * Talks to the free /api/wallet-lookup endpoint (ETH balance, tx count,
 * top ERC-20 tokens). The paid deep tier lives at POST /api/wallet-intel.
 *
 * Everything renders in the browser; the address is only sent to the
 * hub's own backend, never to third-party trackers.
 */

import type { AppConfig } from "../../config";
import { renderToolPage, type ToolPageOptions } from "../tool-page";

const BODY = `
<div class="studio">
  <div class="row">
    <input id="wi-address" class="input" type="text" spellcheck="false"
      placeholder="0x… Base address (40 hex chars)" autocomplete="off">
    <button id="wi-load" class="btn btn-primary">Load snapshot</button>
    <button id="wi-sample" class="btn">Sample</button>
  </div>
  <div id="wi-status" class="status"></div>

  <div id="wi-result" class="pane" hidden>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">ETH balance</div><div id="wi-eth" class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Outgoing txs</div><div id="wi-tx" class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">ERC-20 tokens</div><div id="wi-tokencount" class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Network</div><div id="wi-net" class="stat-value">base</div></div>
    </div>

    <h3 class="pane-title">Top tokens</h3>
    <table class="kv" id="wi-tokens">
      <thead><tr><th>Symbol</th><th>Name</th><th>Balance</th><th>Contract</th></tr></thead>
      <tbody></tbody>
    </table>
    <div id="wi-tokens-empty" class="muted" hidden>No ERC-20 balances found.</div>

    <div class="row" style="margin-top:1rem">
      <a id="wi-basescan" class="btn" href="#" target="_blank" rel="noopener">Open on BaseScan ↗</a>
    </div>
  </div>

  <details class="pane">
    <summary>Deep tier (API, paid) — history, funding sources, risk score</summary>
    <p class="muted">Agents and power users can call <code>POST /api/wallet-intel</code> (x402, $0.001 USDC) for transfer history, first/last activity, funding sources and a heuristic risk score.</p>
  </details>
</div>
`;

const SCRIPT = `
(function () {
  var input = document.getElementById('wi-address');
  var loadBtn = document.getElementById('wi-load');
  var sampleBtn = document.getElementById('wi-sample');
  var status = document.getElementById('wi-status');
  var result = document.getElementById('wi-result');
  var ethEl = document.getElementById('wi-eth');
  var txEl = document.getElementById('wi-tx');
  var tokEl = document.getElementById('wi-tokencount');
  var netEl = document.getElementById('wi-net');
  var tbody = document.querySelector('#wi-tokens tbody');
  var empty = document.getElementById('wi-tokens-empty');
  var scan = document.getElementById('wi-basescan');

  function setStatus(msg, ok) {
    status.textContent = msg || '';
    status.className = ok ? 'status ok' : (msg ? 'status err' : 'status');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

  function render(s) {
    result.hidden = false;
    ethEl.textContent = s.eth_balance + ' ETH';
    txEl.textContent = s.tx_count;
    tokEl.textContent = s.token_count;
    netEl.textContent = s.network;
    scan.href = s.basescan;

    tbody.innerHTML = '';
    var toks = s.tokens || [];
    if (!toks.length) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      toks.forEach(function (t) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + esc(t.symbol || '—') + '</td>' +
          '<td>' + esc(t.name || '—') + '</td>' +
          '<td>' + esc(t.balance) + '</td>' +
          '<td title="' + esc(t.contract) + '">' + esc(short(t.contract)) + '</td>';
        tbody.appendChild(tr);
      });
    }
  }

  async function load(addr) {
    var a = (addr || input.value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      setStatus('Enter a valid 0x… address (40 hex chars).', false);
      return;
    }
    setStatus('Loading…', true);
    try {
      var r = await fetch('/api/wallet-lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: a })
      });
      var j = await r.json();
      if (!r.ok || !j.ok) {
        setStatus('Lookup failed: ' + (j.error || r.status), false);
        return;
      }
      render(j.snapshot);
      setStatus('Snapshot loaded.', true);
    } catch (e) {
      setStatus('Network error: ' + e.message, false);
    }
  }

  loadBtn.onclick = function () { load(); };
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });
  sampleBtn.onclick = function () {
    input.value = '0x4200000000000000000000000000000000000006';
    load(input.value);
  };
})();
`;

export function walletIntelPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "wallet-intel",
    title: "Wallet Intel",
    intro:
      "Paste a Base (EVM) address to get an on-chain snapshot: ETH balance, " +
      "outgoing transaction count and the top ERC-20 tokens. The web form is free " +
      "and read-only; the deep tier is available to agents at " +
      "<code>POST /api/wallet-intel</code> (x402, $0.001 USDC).",
    howToUse: [
      "Paste a Base (EVM) address into the field.",
      "Click <strong>Inspect</strong> to read the live on-chain snapshot.",
      "Review ETH balance, outgoing transaction count and top ERC-20 tokens.",
      "Copy the address or open it on Basescan.",
    ],
    useCases: [
      "Screening a wallet before you interact with it.",
      "Getting a quick portfolio overview without a block explorer.",
      "Checking activity level before an x402 payment.",
      "Agents pulling deep data via the paid <code>POST /api/wallet-intel</code> endpoint ($0.001 USDC).",
    ],
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
