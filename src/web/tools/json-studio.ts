/**
 * JSON Studio — format, validate, query, diff. 100% client-side.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="studio-toolbar">
    <button id="btn-format" class="btn btn-primary">Format</button>
    <button id="btn-minify" class="btn">Minify</button>
    <button id="btn-validate" class="btn">Validate</button>
    <select id="indent" class="select">
      <option value="2">2 spaces</option>
      <option value="4">4 spaces</option>
      <option value="tab">Tab</option>
    </select>
    <button id="btn-copy" class="btn">Copy</button>
    <button id="btn-download" class="btn">Download</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <textarea id="input" class="editor" spellcheck="false"
    placeholder='Paste JSON here, e.g. {"hello":"world"}'></textarea>

  <div id="status" class="status"></div>

  <details class="pane">
    <summary>Tree view</summary>
    <div id="tree" class="tree"></div>
  </details>

  <details class="pane">
    <summary>Query (JSONPath-lite: <code>$.a.b[0]</code>)</summary>
    <div class="query-row">
      <input id="path" class="input" placeholder="$.items[0].name">
      <button id="btn-query" class="btn">Run</button>
    </div>
    <pre id="query-out" class="out"></pre>
  </details>

  <details class="pane">
    <summary>Diff vs. second JSON</summary>
    <textarea id="input-b" class="editor" spellcheck="false"
      placeholder="Second JSON to compare against"></textarea>
    <button id="btn-diff" class="btn">Compare</button>
    <pre id="diff-out" class="out"></pre>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const input = $("input"), status = $("status"), tree = $("tree");

  function indentValue() {
    const v = $("indent").value;
    return v === "tab" ? "\\t" : Number(v);
  }

  function setStatus(msg, ok) {
    status.textContent = msg;
    status.className = "status " + (ok ? "ok" : "err");
  }

  function parse(text) {
    try { return { ok: true, value: JSON.parse(text) }; }
    catch (e) {
      const m = /position (\\d+)/.exec(String(e.message));
      const pos = m ? Number(m[1]) : -1;
      let line = 1, col = 1;
      if (pos >= 0) {
        const before = text.slice(0, pos);
        line = before.split("\\n").length;
        col = pos - before.lastIndexOf("\\n");
      }
      return { ok: false, error: e.message, line, col };
    }
  }

  function renderTree(node, depth) {
    const pad = "  ".repeat(depth);
    if (node === null) return pad + "null";
    if (Array.isArray(node)) {
      if (!node.length) return pad + "[]";
      return pad + "[\\n" + node.map((v) => renderTree(v, depth + 1)).join(",\\n") + "\\n" + pad + "]";
    }
    if (typeof node === "object") {
      const keys = Object.keys(node);
      if (!keys.length) return pad + "{}";
      return pad + "{\\n" + keys.map((k) =>
        pad + "  " + JSON.stringify(k) + ": " + renderTree(node[k], depth + 1)
      ).join(",\\n") + "\\n" + pad + "}";
    }
    return pad + JSON.stringify(node);
  }

  function jsonPath(obj, path) {
    if (!path || path === "$") return obj;
    const parts = path.replace(/^\\$/, "").replace(/^\\./, "").split(/\\.|\\[(\\d+)\\]/)
      .filter((p) => p !== undefined && p !== "");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function diff(a, b, path) {
    const out = [];
    const isObj = (v) => v && typeof v === "object";
    if (!isObj(a) || !isObj(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        out.push(path + ": " + JSON.stringify(a) + " -> " + JSON.stringify(b));
      }
      return out;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const p = path ? path + "." + k : k;
      if (!(k in a)) out.push("+ " + p + " = " + JSON.stringify(b[k]));
      else if (!(k in b)) out.push("- " + p + " (was " + JSON.stringify(a[k]) + ")");
      else out.push(...diff(a[k], b[k], p));
    }
    return out;
  }

  $("btn-format").onclick = () => {
    const r = parse(input.value);
    if (!r.ok) return setStatus("Invalid JSON at line " + r.line + ", col " + r.col + ": " + r.error, false);
    input.value = JSON.stringify(r.value, null, indentValue());
    tree.textContent = renderTree(r.value, 0);
    setStatus("Valid JSON · formatted", true);
  };

  $("btn-minify").onclick = () => {
    const r = parse(input.value);
    if (!r.ok) return setStatus("Invalid JSON at line " + r.line + ", col " + r.col + ": " + r.error, false);
    input.value = JSON.stringify(r.value);
    setStatus("Valid JSON · minified", true);
  };

  $("btn-validate").onclick = () => {
    const r = parse(input.value);
    if (!r.ok) return setStatus("Invalid JSON at line " + r.line + ", col " + r.col + ": " + r.error, false);
    tree.textContent = renderTree(r.value, 0);
    setStatus("Valid JSON", true);
  };

  $("btn-copy").onclick = () => {
    navigator.clipboard.writeText(input.value);
    setStatus("Copied to clipboard", true);
  };

  $("btn-download").onclick = () => {
    const blob = new Blob([input.value], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $("btn-clear").onclick = () => {
    input.value = "";
    tree.textContent = "";
    $("query-out").textContent = "";
    $("diff-out").textContent = "";
    setStatus("", true);
  };

  $("btn-query").onclick = () => {
    const r = parse(input.value);
    if (!r.ok) return setStatus("Fix JSON before querying", false);
    const res = jsonPath(r.value, $("path").value.trim());
    $("query-out").textContent = res === undefined
      ? "(no match)"
      : JSON.stringify(res, null, indentValue());
  };

  $("btn-diff").onclick = () => {
    const a = parse(input.value), b = parse($("input-b").value);
    if (!a.ok || !b.ok) return setStatus("Both sides must be valid JSON", false);
    const d = diff(a.value, b.value, "$");
    $("diff-out").textContent = d.length ? d.join("\\n") : "No differences";
  };
})();
`;

export function jsonStudioPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "json-studio",
    title: "JSON Studio",
    intro:
      "Format, minify, validate, explore and diff JSON — entirely in your browser. " +
      "The paid API endpoint for agents is at <code>POST /api/json-studio</code>.",
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
