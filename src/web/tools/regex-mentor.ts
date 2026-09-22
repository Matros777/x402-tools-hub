/**
 * Regex Mentor — test, debug and understand regular expressions.
 * 100% client-side: patterns run through the native RegExp engine.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="query-row">
    <span class="regex-slash">/</span>
    <input id="pattern" class="input" spellcheck="false" placeholder="\\b\\w+@\\w+\\.\\w+\\b">
    <span class="regex-slash">/</span>
    <input id="flags" class="input input-flags" spellcheck="false" placeholder="gi" maxlength="8">
  </div>

  <div class="flag-row">
    <label class="flag-chip"><input type="checkbox" id="flag-g"> g</label>
    <label class="flag-chip"><input type="checkbox" id="flag-i"> i</label>
    <label class="flag-chip"><input type="checkbox" id="flag-m"> m</label>
    <label class="flag-chip"><input type="checkbox" id="flag-s"> s</label>
    <label class="flag-chip"><input type="checkbox" id="flag-u"> u</label>
    <label class="flag-chip"><input type="checkbox" id="flag-y"> y</label>
  </div>

  <div class="studio-toolbar">
    <button id="btn-sample" class="btn">Sample</button>
    <button id="btn-test" class="btn btn-primary">Test</button>
    <button id="btn-copy" class="btn">Copy matches</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <textarea id="text" class="editor" spellcheck="false"
    placeholder="Paste the text to search in. Matches are highlighted below as you type."></textarea>

  <div id="status" class="status"></div>

  <details class="pane" open>
    <summary>Highlighted text</summary>
    <pre id="highlight" class="out out-wrap"></pre>
  </details>

  <details class="pane" open>
    <summary>Matches <span id="match-count" class="badge">0</span></summary>
    <div id="matches" class="kv"></div>
  </details>

  <details class="pane">
    <summary>Cheatsheet</summary>
    <div class="cheat">
      <div class="cheat-row"><code>.</code><span>any char except newline</span></div>
      <div class="cheat-row"><code>\\d \\D</code><span>digit / non-digit</span></div>
      <div class="cheat-row"><code>\\w \\W</code><span>word char / non-word</span></div>
      <div class="cheat-row"><code>\\s \\S</code><span>whitespace / non-whitespace</span></div>
      <div class="cheat-row"><code>\\b \\B</code><span>word boundary / not a boundary</span></div>
      <div class="cheat-row"><code>^ $</code><span>start / end of line (with <b>m</b>)</span></div>
      <div class="cheat-row"><code>[abc] [^abc]</code><span>char set / negated set</span></div>
      <div class="cheat-row"><code>[a-z]</code><span>range</span></div>
      <div class="cheat-row"><code>* + ?</code><span>0+ / 1+ / 0 or 1</span></div>
      <div class="cheat-row"><code>{2} {2,} {2,5}</code><span>exact / min / range</span></div>
      <div class="cheat-row"><code>*? +?</code><span>lazy (non-greedy)</span></div>
      <div class="cheat-row"><code>(abc)</code><span>capturing group</span></div>
      <div class="cheat-row"><code>(?:abc)</code><span>non-capturing group</span></div>
      <div class="cheat-row"><code>(?&lt;name&gt;abc)</code><span>named group</span></div>
      <div class="cheat-row"><code>a|b</code><span>alternation</span></div>
      <div class="cheat-row"><code>(?=abc) (?!abc)</code><span>lookahead / negative</span></div>
      <div class="cheat-row"><code>(?&lt;=abc) (?&lt;!abc)</code><span>lookbehind / negative</span></div>
      <div class="cheat-row"><code>\\1 $1</code><span>backreference / replacement</span></div>
      <div class="cheat-row"><code>g i m s u y</code><span>global, ignore case, multiline, dotAll, unicode, sticky</span></div>
    </div>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const patternEl = $("pattern"), flagsEl = $("flags"), textEl = $("text");
  const status = $("status"), highlight = $("highlight"), matches = $("matches");

  const FLAGS = ["g", "i", "m", "s", "u", "y"];

  function setStatus(msg, ok) {
    status.textContent = msg;
    status.className = "status " + (ok ? "ok" : "err");
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function syncFlagsFromBoxes() {
    let out = "";
    for (const f of FLAGS) {
      const box = $("flag-" + f);
      if (box && box.checked) out += f;
    }
    flagsEl.value = out;
  }

  function syncBoxesFromFlags() {
    const active = flagsEl.value;
    for (const f of FLAGS) {
      const box = $("flag-" + f);
      if (box) box.checked = active.indexOf(f) !== -1;
    }
  }

  function buildRegex() {
    const pat = patternEl.value;
    const flags = flagsEl.value.replace(/[^gimsuy]/g, "");
    if (!pat) return { ok: false, error: "empty pattern" };
    try {
      return { ok: true, re: new RegExp(pat, flags), flags: flags };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  }

  function collectMatches(re, text) {
    const out = [];
    if (!re.global && !re.sticky) {
      const m = re.exec(text);
      if (m) out.push(snapshot(m));
      return out;
    }
    re.lastIndex = 0;
    let m;
    let guard = 0;
    while ((m = re.exec(text)) !== null) {
      out.push(snapshot(m));
      if (m[0] === "") re.lastIndex++;
      if (++guard > 10000) break;
    }
    return out;
  }

  function snapshot(m) {
    return {
      value: m[0],
      index: m.index,
      groups: m.slice(1),
      named: m.groups || null,
    };
  }

  function renderHighlight(text, matches) {
    if (!matches.length) return escapeHtml(text);
    let out = "";
    let cursor = 0;
    const spans = matches.slice().sort((a, b) => a.index - b.index);
    for (const m of spans) {
      const start = Math.max(m.index, cursor);
      const end = m.index + m.value.length;
      if (end <= cursor) continue;
      out += escapeHtml(text.slice(cursor, start));
      if (m.value.length === 0) {
        out += "<mark class=\"hl-zero\"></mark>";
        cursor = start;
      } else {
        out += "<mark>" + escapeHtml(text.slice(start, end)) + "</mark>";
        cursor = end;
      }
    }
    out += escapeHtml(text.slice(cursor));
    return out;
  }

  function renderMatches(matches) {
    $("match-count").textContent = String(matches.length);
    if (!matches.length) {
      matches_el_empty();
      return;
    }
    matches.innerHTML = matches.map((m, i) => {
      let rows = '<div class="kv-row"><span class="kv-k">#' + (i + 1) + '</span>' +
        '<span class="kv-v"><code>' + escapeHtml(m.value) + '</code> @ ' + m.index + '</span></div>';
      if (m.groups.length) {
        rows += m.groups.map((g, gi) =>
          '<div class="kv-row kv-sub"><span class="kv-k">group ' + (gi + 1) + '</span>' +
          '<span class="kv-v">' + (g === undefined ? '<span class="muted">undefined</span>' : '<code>' + escapeHtml(g) + '</code>') + '</span></div>'
        ).join("");
      }
      if (m.named) {
        rows += Object.keys(m.named).map((k) =>
          '<div class="kv-row kv-sub"><span class="kv-k">' + escapeHtml(k) + '</span>' +
          '<span class="kv-v"><code>' + escapeHtml(String(m.named[k])) + '</code></span></div>'
        ).join("");
      }
      return rows;
    }).join("");
  }

  function matches_el_empty() {
    matches.innerHTML = '<div class="kv-row"><span class="kv-v muted">(no matches)</span></div>';
  }

  function run() {
    syncFlagsFromBoxes();
    const r = buildRegex();
    const text = textEl.value;
    if (!r.ok) {
      setStatus("Invalid pattern: " + r.error, false);
      highlight.textContent = text;
      $("match-count").textContent = "0";
      matches_el_empty();
      return;
    }
    const ms = collectMatches(r.re, text);
    highlight.innerHTML = renderHighlight(text, ms);
    renderMatches(ms);
    setStatus(ms.length + " match" + (ms.length === 1 ? "" : "es") + " — evaluated locally", true);
  }

  patternEl.addEventListener("input", run);
  flagsEl.addEventListener("input", () => { syncBoxesFromFlags(); run(); });
  textEl.addEventListener("input", run);
  for (const f of FLAGS) {
    const box = $("flag-" + f);
    if (box) box.addEventListener("change", run);
  }

  $("btn-test").onclick = run;

  $("btn-sample").onclick = () => {
    patternEl.value = "\\\\b\\\\w+@\\\\w+\\\\.\\\\w+\\\\b";
    flagsEl.value = "gi";
    syncBoxesFromFlags();
    textEl.value = "Contact support@example.com or sales@acme.io. Invalid: nope@, @nope.com";
    run();
  };

  $("btn-copy").onclick = () => {
    const r = buildRegex();
    if (!r.ok) return setStatus("Nothing to copy — fix the pattern first", false);
    const ms = collectMatches(r.re, textEl.value);
    const report = ms.map((m, i) =>
      "#" + (i + 1) + " @" + m.index + ": " + JSON.stringify(m.value) +
      (m.groups.length ? " groups=" + JSON.stringify(m.groups) : "")
    ).join("\\n");
    navigator.clipboard.writeText(report || "(no matches)");
    setStatus("Matches copied to clipboard", true);
  };

  $("btn-clear").onclick = () => {
    patternEl.value = "";
    flagsEl.value = "";
    syncBoxesFromFlags();
    textEl.value = "";
    highlight.textContent = "";
    $("match-count").textContent = "0";
    matches_el_empty();
    setStatus("", true);
  };

  syncBoxesFromFlags();
  matches_el_empty();
})();
`;

export function regexMentorPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "regex-mentor",
    title: "Regex Mentor",
    intro:
      "Write, test and understand regular expressions — highlighted matches, groups and a " +
      "cheatsheet, all evaluated locally in your browser. " +
      "The paid API endpoint for agents is at <code>POST /api/regex-mentor</code>.",
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
