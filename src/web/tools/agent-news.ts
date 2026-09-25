/**
 * Agent news tools — browser pages for:
 *   - hn-news     : Hacker News search by keyword
 *   - x-search    : X/Twitter mentions + recent news by keyword
 *   - ai-incidents: AI agent incident / risk news feed
 *
 * Free browser pages. Their /lookup endpoints are intentionally NOT in the
 * x402 TOOLS table, so they stay open to humans. Paid POST /api/<tool> is
 * the same payload for agents.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

/* Shared client-side logic for all three news tools. */
const NEWS_SCRIPT = `
(function () {
  var qEl = document.getElementById('nw-q');
  var btn = document.getElementById('nw-run');
  var status = document.getElementById('nw-status');
  var out = document.getElementById('nw-out');

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

  function render(items) {
    if (!items || !items.length) {
      out.innerHTML = '<p class="dim">No results.</p>';
      return;
    }
    var cards = items.map(function (it, i) {
      var meta = [];
      if (it.source) meta.push(esc(it.source));
      if (it.author) meta.push('by ' + esc(it.author));
      if (it.points != null) meta.push(esc(it.points) + ' pts');
      if (it.comments != null) meta.push(esc(it.comments) + ' comments');
      if (it.published) meta.push(esc(it.published));
      return (
        '<div class="news-item">' +
          '<a class="news-title" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a>' +
          '<div class="news-meta">' + meta.join(' · ') + '</div>' +
        '</div>'
      );
    }).join('');
    out.innerHTML = cards;
  }

  function run() {
    var q = (qEl ? (qEl.value || '').trim() : '');
    var endpoint = (btn.getAttribute('data-endpoint') || '').trim();
    if (!endpoint) { setStatus('Endpoint missing', false); return; }
    if (qEl && !q) { setStatus('Enter a search query', false); return; }
    setStatus('Searching…', true);
    out.innerHTML = '';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(qEl ? { query: q, limit: 8 } : { limit: 8 }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { setStatus((d && d.error) || 'Search failed', false); return; }
        render(d.items);
        setStatus('OK · ' + (d.items ? d.items.length : 0) + ' results', true);
      })
      .catch(function () { setStatus('Network error', false); });
  }

  btn.addEventListener('click', run);
  if (qEl) qEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  run();
})();
`;

/** Shared body: optional query row (hidden for ai-incidents), output pane. */
function newsBody(hasQuery: boolean): string {
  const queryRow = hasQuery
    ? `<div class="query-row">
         <input id="nw-q" class="input" type="text" placeholder="AI agents, x402, incidents…" spellcheck="false" autocomplete="off">
       </div>`
    : "";
  return `
    <div class="studio">
      <div class="query-row">
        ${queryRow}
        <button id="nw-run" class="btn btn-primary" type="button" data-endpoint="">Run</button>
      </div>
      <div id="nw-status" class="status" role="status"></div>
      <div id="nw-out"></div>
    </div>
  `;
}

export function hnNewsPage(cfg: AppConfig): string {
  const body = newsBody(true).replace(`data-endpoint=""`, `data-endpoint="/api/hn-news/lookup"`);
  return renderToolPage(cfg, {
    name: "hn-news",
    title: "Hacker News Search",
    intro:
      "Fresh Hacker News stories and discussions by keyword — AI agents, x402, crypto infrastructure, incidents. Powered by the public Algolia HN API, no key required.",
    howToUse: [
      "Type a keyword (e.g. \"AI agents\" or \"x402\").",
      "Hit Run — the 8 most relevant stories come back with points and comments.",
      "Click a title to open the thread on Hacker News.",
      "Agents call the paid POST /api/hn-news endpoint ($0.001).",
    ],
    useCases: [
      "Agent monitoring: what the builder community says about a topic.",
      "Researching an incident, a protocol, or a tool before relying on it.",
      "Feeding an agent's context with fresh community discussion.",
    ],
    body,
    script: NEWS_SCRIPT,
  });
}

export function xSearchPage(cfg: AppConfig): string {
  const body = newsBody(true).replace(`data-endpoint=""`, `data-endpoint="/api/x-search/lookup"`);
  return renderToolPage(cfg, {
    name: "x-search",
    title: "X / Twitter Search",
    intro:
      "Recent X/Twitter mentions and news by keyword — agent launches, token drama, AI agent incidents. Aggregated from public news RSS, no API key required.",
    howToUse: [
      "Type a keyword (e.g. \"AI agent\" or a project name).",
      "Hit Run — the freshest mentions come back with source and date.",
      "Click a title to read the full post.",
      "Agents call the paid POST /api/x-search endpoint ($0.001).",
    ],
    useCases: [
      "Social proof: is the community talking about this agent or token?",
      "Incident detection: sudden spike of posts about a failure or scam.",
      "Vibes check before an agent commits a payment.",
    ],
    body,
    script: NEWS_SCRIPT,
  });
}

export function aiIncidentsPage(cfg: AppConfig): string {
  const body = newsBody(false).replace(`data-endpoint=""`, `data-endpoint="/api/ai-incidents/lookup"`);
  return renderToolPage(cfg, {
    name: "ai-incidents",
    title: "AI Agent Incidents",
    intro:
      "A rotating feed of AI agent incidents and risks: failures, bugs, hacks, hallucinations, jailbreaks and leaks — pulled live from Hacker News and Google News. No key required.",
    howToUse: [
      "Just hit Run — no query needed, the feed rotates through risk topics.",
      "Read headlines, click through to the source.",
      "Use it as a daily risk scan for autonomous agents.",
      "Agents call the paid POST /api/ai-incidents endpoint ($0.001).",
    ],
    useCases: [
      "Risk monitoring for an autonomous agent fleet.",
      "Context for trust decisions: is the ecosystem having a bad day?",
      "A research signal for agent incident databases.",
    ],
    body,
    script: NEWS_SCRIPT,
  });
}