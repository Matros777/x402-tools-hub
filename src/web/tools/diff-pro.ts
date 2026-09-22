/**
 * Diff Pro — line-level text diff. Unified + side-by-side views.
 * 100% client-side: LCS runs in the browser, nothing is uploaded.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="diff-grid">
    <textarea id="input-a" class="editor" spellcheck="false"
      placeholder="Original text (left side)"></textarea>
    <textarea id="input-b" class="editor" spellcheck="false"
      placeholder="Changed text (right side)"></textarea>
  </div>

  <div class="studio-toolbar">
    <button id="btn-compare" class="btn btn-primary">Compare</button>
    <button id="btn-sample" class="btn">Sample</button>
    <button id="btn-swap" class="btn">Swap ⇅</button>
    <button id="btn-copy" class="btn">Copy unified</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <div class="query-row">
    <label class="flag-chip"><input type="checkbox" id="opt-ws"> ignore whitespace</label>
    <label class="flag-chip"><input type="checkbox" id="opt-case"> ignore case</label>
    <label class="flag-chip"><input type="checkbox" id="opt-context" checked> context ±3</label>
  </div>

  <div id="status" class="status"></div>

  <div class="stat-grid">
    <div class="stat"><div class="stat-val" id="s-added">0</div><div class="stat-lbl">added</div></div>
    <div class="stat"><div class="stat-val" id="s-removed">0</div><div class="stat-lbl">removed</div></div>
    <div class="stat"><div class="stat-val" id="s-unchanged">0</div><div class="stat-lbl">unchanged</div></div>
    <div class="stat"><div class="stat-val" id="s-hunks">0</div><div class="stat-lbl">hunks</div></div>
  </div>

  <details class="pane" open>
    <summary>Unified diff</summary>
    <pre id="out-unified" class="out out-wrap"></pre>
  </details>

  <details class="pane" open>
    <summary>Side-by-side</summary>
    <div id="out-side" class="diff-side"></div>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const aEl = $("input-a"), bEl = $("input-b");
  const status = $("status");

  function setStatus(msg, ok) {
    status.textContent = msg;
    status.className = "status " + (ok ? "ok" : "err");
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function norm(line) {
    let t = line;
    if ($("opt-ws").checked) t = t.replace(/\\s+/g, " ").trim();
    if ($("opt-case").checked) t = t.toLowerCase();
    return t;
  }

  // Classic LCS over lines. Returns array of ops: {type:'keep'|'del'|'ins', a, b}
  function lcsOps(A, B) {
    const n = A.length, m = B.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = A[i] === B[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push({ type: "keep", a: i, b: j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: "del", a: i, b: -1 }); i++; }
      else { ops.push({ type: "ins", a: -1, b: j }); j++; }
    }
    while (i < n) { ops.push({ type: "del", a: i, b: -1 }); i++; }
    while (j < m) { ops.push({ type: "ins", a: -1, b: j }); j++; }
    return ops;
  }

  function buildHunks(ops, A, B, withContext) {
    const ctx = withContext ? 3 : 0;
    const hunks = [];
    let cur = null;
    let sinceChange = 1e9;
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      const changed = op.type !== "keep";
      if (changed) {
        if (!cur) {
          const start = Math.max(0, k - ctx);
          cur = { ops: [], startK: start };
        }
        // extend with the in-between keeps
        while (cur.ops.length + cur.startK < k) {
          cur.ops.push(ops[cur.startK + cur.ops.length]);
        }
        cur.ops.push(op);
        sinceChange = 0;
      } else if (cur) {
        sinceChange++;
        if (sinceChange <= ctx) cur.ops.push(op);
        else { hunks.push(cur); cur = null; sinceChange = 1e9; }
      }
    }
    if (cur) hunks.push(cur);
    return hunks;
  }

  function unifiedHeader(hunk) {
    let aStart = 1, aCount = 0, bStart = 1, bCount = 0;
    let first = true;
    for (const op of hunk.ops) {
      if (op.a >= 0) { if (first) aStart = op.a + 1; aCount++; first = false; }
    }
    first = true;
    for (const op of hunk.ops) {
      if (op.b >= 0) { if (first) bStart = op.b + 1; bCount++; first = false; }
    }
    return "@@ -" + aStart + "," + aCount + " +" + bStart + "," + bCount + " @@";
  }

  function compare() {
    const rawA = aEl.value.split("\\n");
    const rawB = bEl.value.split("\\n");
    const A = rawA.map(norm);
    const B = rawB.map(norm);

    const ops = lcsOps(A, B);
    const withCtx = $("opt-context").checked;
    const hunks = buildHunks(ops, rawA, rawB, withCtx);

    let added = 0, removed = 0, unchanged = 0;
    for (const op of ops) {
      if (op.type === "ins") added++;
      else if (op.type === "del") removed++;
      else unchanged++;
    }
    $("s-added").textContent = added.toLocaleString();
    $("s-removed").textContent = removed.toLocaleString();
    $("s-unchanged").textContent = unchanged.toLocaleString();
    $("s-hunks").textContent = hunks.length.toLocaleString();

    // Unified
    const out = [];
    for (const h of hunks) {
      out.push(unifiedHeader(h));
      for (const op of h.ops) {
        if (op.type === "keep") out.push(" " + rawA[op.a]);
        else if (op.type === "del") out.push("-" + rawA[op.a]);
        else out.push("+" + rawB[op.b]);
      }
    }
    $("out-unified").textContent = out.join("\\n") || "(no differences)";

    // Side-by-side
    const rows = [];
    for (const h of hunks) {
      rows.push('<div class="diff-hunk">' + esc(unifiedHeader(h)) + '</div>');
      for (const op of h.ops) {
        if (op.type === "keep") {
          rows.push('<div class="diff-row"><span class="diff-cell">' + esc(rawA[op.a]) +
            '</span><span class="diff-cell">' + esc(rawB[op.b]) + '</span></div>');
        } else if (op.type === "del") {
          rows.push('<div class="diff-row"><span class="diff-cell diff-del">' + esc(rawA[op.a]) +
            '</span><span class="diff-cell"></span></div>');
        } else {
          rows.push('<div class="diff-row"><span class="diff-cell"></span>' +
            '<span class="diff-cell diff-add">' + esc(rawB[op.b]) + '</span></div>');
        }
      }
    }
    $("out-side").innerHTML = rows.join("") ||
      '<div class="diff-row"><span class="diff-cell muted">(identical)</span><span class="diff-cell muted">(identical)</span></div>';

    if (added + removed === 0) setStatus("Identical — 0 differences", true);
    else setStatus(added + " added, " + removed + " removed, " + hunks.length + " hunk(s) — computed locally", true);
  }

  $("btn-compare").onclick = compare;
  aEl.addEventListener("input", compare);
  bEl.addEventListener("input", compare);
  for (const id of ["opt-ws", "opt-case", "opt-context"]) {
    $(id).addEventListener("change", compare);
  }

  $("btn-sample").onclick = () => {
    aEl.value = "function greet(name) {\\n  console.log(\"Hello, \" + name);\\n  return true;\\n}";
    bEl.value = "function greet(name, greeting) {\\n  const msg = \"Hello, \" + name;\\n  console.log(msg);\\n  return true;\\n}";
    compare();
  };

  $("btn-swap").onclick = () => {
    const t = aEl.value; aEl.value = bEl.value; bEl.value = t;
    compare();
  };

  $("btn-copy").onclick = () => {
    navigator.clipboard.writeText($("out-unified").textContent || "");
    setStatus("Unified diff copied to clipboard", true);
  };

  $("btn-clear").onclick = () => {
    aEl.value = ""; bEl.value = "";
    $("out-unified").textContent = "";
    $("out-side").innerHTML = "";
    $("s-added").textContent = "0"; $("s-removed").textContent = "0";
    $("s-unchanged").textContent = "0"; $("s-hunks").textContent = "0";
    setStatus("", true);
  };
})();
`;

export function diffProPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "diff-pro",
    title: "Diff Pro",
    intro:
      "Compare two blocks of text line by line — unified diff, side-by-side view and " +
      "stats, all computed locally in your browser. " +
      "The paid API endpoint for agents is at <code>POST /api/diff-pro</code>.",
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
