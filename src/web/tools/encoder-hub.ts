/**
 * Encoder Hub — Base64, URL, HTML entities, hex, binary, JWT-segment.
 * 100% client-side: every codec runs in the browser via native APIs.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="query-row">
    <label class="lbl">Codec</label>
    <select id="codec" class="select">
      <option value="base64">Base64</option>
      <option value="base64url">Base64 (URL-safe)</option>
      <option value="url">URL (encodeURIComponent)</option>
      <option value="html">HTML entities</option>
      <option value="hex">Hex</option>
      <option value="binary">Binary (01)</option>
      <option value="jwt">JWT segment (base64url)</option>
    </select>

    <label class="lbl">Mode</label>
    <select id="mode" class="select">
      <option value="encode">Encode</option>
      <option value="decode">Decode</option>
    </select>

    <button id="btn-run" class="btn btn-primary">Run</button>
  </div>

  <div class="studio-toolbar">
    <button id="btn-sample" class="btn">Sample</button>
    <button id="btn-swap" class="btn">Swap ⇅</button>
    <button id="btn-copy" class="btn">Copy result</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <textarea id="input" class="editor" spellcheck="false"
    placeholder="Type or paste the value. Press Run (or just type) — everything is processed locally."></textarea>

  <div id="status" class="status"></div>

  <details class="pane" open>
    <summary>Result</summary>
    <pre id="out" class="out out-wrap"></pre>
  </details>

  <details class="pane">
    <summary>All codecs at once (encode input)</summary>
    <div id="all" class="kv"></div>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const input = $("input"), out = $("out"), status = $("status");
  const codecEl = $("codec"), modeEl = $("mode");

  function setStatus(msg, ok) {
    status.textContent = msg;
    status.className = "status " + (ok ? "ok" : "err");
  }

  // ---- codecs -------------------------------------------------------

  function b64Encode(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function b64Decode(s) {
    const bin = atob(s.replace(/\\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function b64UrlEncode(s) {
    return b64Encode(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  }

  function b64UrlDecode(s) {
    let t = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\\s+/g, "");
    while (t.length % 4) t += "=";
    return b64Decode(t);
  }

  function hexEncode(s) {
    const bytes = new TextEncoder().encode(s);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hexDecode(s) {
    const t = s.replace(/\\s+|0x/gi, "");
    if (t.length % 2) throw new Error("hex length must be even");
    const bytes = new Uint8Array(t.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(t.substr(i * 2, 2), 16);
    return new TextDecoder().decode(bytes);
  }

  function binEncode(s) {
    const bytes = new TextEncoder().encode(s);
    return Array.from(bytes).map((b) => b.toString(2).padStart(8, "0")).join(" ");
  }

  function binDecode(s) {
    const bits = s.replace(/[^01]/g, "");
    if (bits.length % 8) throw new Error("binary length must be a multiple of 8");
    const bytes = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    return new TextDecoder().decode(bytes);
  }

  function htmlEncode(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function htmlDecode(s) {
    return s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  const CODECS = {
    base64:    { encode: b64Encode,    decode: b64Decode },
    base64url: { encode: b64UrlEncode, decode: b64UrlDecode },
    url:       { encode: encodeURIComponent, decode: decodeURIComponent },
    html:      { encode: htmlEncode,   decode: htmlDecode },
    hex:       { encode: hexEncode,    decode: hexDecode },
    binary:    { encode: binEncode,    decode: binDecode },
    jwt:       { encode: b64UrlEncode, decode: b64UrlDecode },
  };

  // ---- run ---------------------------------------------------------

  function run() {
    const codec = codecEl.value;
    const mode = modeEl.value;
    const value = input.value;
    const fn = CODECS[codec] && CODECS[codec][mode];
    if (!fn) return setStatus("Unknown codec/mode", false);
    try {
      const res = fn(value);
      out.textContent = res;
      setStatus(codec + " · " + mode + " — ok (" + res.length + " chars)", true);
    } catch (e) {
      out.textContent = "";
      setStatus("Error: " + String(e.message || e), false);
    }
    renderAll(value);
  }

  function renderAll(value) {
    if (!value) { $("all").innerHTML = '<div class="kv-row"><span class="kv-v muted">(empty)</span></div>'; return; }
    const rows = [];
    for (const key of Object.keys(CODECS)) {
      try {
        const res = CODECS[key].encode(value);
        const short = res.length > 120 ? res.slice(0, 120) + "…" : res;
        rows.push('<div class="kv-row"><span class="kv-k">' + key + '</span>' +
          '<span class="kv-v"><code>' + escapeHtml(short) + '</code></span></div>');
      } catch (e) {
        rows.push('<div class="kv-row"><span class="kv-k">' + key + '</span>' +
          '<span class="kv-v muted">' + escapeHtml(String(e.message || e)) + '</span></div>');
      }
    }
    $("all").innerHTML = rows.join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  $("btn-run").onclick = run;
  codecEl.onchange = run;
  modeEl.onchange = run;
  input.addEventListener("input", run);

  $("btn-sample").onclick = () => {
    codecEl.value = "base64";
    modeEl.value = "encode";
    input.value = "Hello, x402 Tools Hub! Привет, мир. ";
    run();
  };

  $("btn-swap").onclick = () => {
    const r = out.textContent || "";
    if (!r) return setStatus("Nothing to swap yet", false);
    input.value = r;
    modeEl.value = modeEl.value === "encode" ? "decode" : "encode";
    run();
  };

  $("btn-copy").onclick = () => {
    navigator.clipboard.writeText(out.textContent || "");
    setStatus("Result copied to clipboard", true);
  };

  $("btn-clear").onclick = () => {
    input.value = "";
    out.textContent = "";
    setStatus("", true);
    renderAll("");
  };

  renderAll("");
})();
`;

export function encoderHubPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "encoder-hub",
    title: "Encoder Hub",
    intro:
      "Base64, URL, HTML entities, hex, binary and JWT segments — encode and decode " +
      "entirely in your browser. " +
      "The paid API endpoint for agents is at <code>POST /api/encoder-hub</code>.",
    howToUse: [
      "Choose an encoding: Base64, URL, HTML entities, hex, binary or JWT segments.",
      "Paste your text and pick <strong>Encode</strong> or <strong>Decode</strong>.",
      "Inspect the output, then copy it with one click.",
    ],
    useCases: [
      "Decoding a Base64 blob from a log or a JWT payload.",
      "URL-encoding query parameters before building a request.",
      "Escaping HTML entities for safe rendering.",
      "Agents converting payloads via the paid <code>POST /api/encoder-hub</code> endpoint.",
    ],
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
