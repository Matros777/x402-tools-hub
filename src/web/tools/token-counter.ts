/**
 * Token Counter — count characters, words, lines and estimate LLM tokens.
 * 100% client-side.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="studio-toolbar">
    <button id="btn-sample" class="btn">Sample</button>
    <button id="btn-copy" class="btn">Copy stats</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <textarea id="input" class="editor" spellcheck="false"
    placeholder="Paste text here — counts update as you type"></textarea>

  <div id="status" class="status"></div>

  <div class="stat-grid">
    <div class="stat"><div class="stat-val" id="s-chars">0</div><div class="stat-lbl">characters</div></div>
    <div class="stat"><div class="stat-val" id="s-nospace">0</div><div class="stat-lbl">chars (no spaces)</div></div>
    <div class="stat"><div class="stat-val" id="s-words">0</div><div class="stat-lbl">words</div></div>
    <div class="stat"><div class="stat-val" id="s-lines">0</div><div class="stat-lbl">lines</div></div>
    <div class="stat"><div class="stat-val" id="s-sents">0</div><div class="stat-lbl">sentences</div></div>
    <div class="stat"><div class="stat-val" id="s-bytes">0</div><div class="stat-lbl">bytes (UTF-8)</div></div>
  </div>

  <details class="pane" open>
    <summary>Estimated tokens by model</summary>
    <div id="models" class="kv"></div>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const input = $("input"), status = $("status");

  // Rough chars-per-token ratios (public rules of thumb).
  const MODELS = [
    { name: "GPT-4 / GPT-3.5 (cl100k)", cpt: 4.0 },
    { name: "GPT-4o (o200k)", cpt: 4.0 },
    { name: "Claude 3 / 3.5", cpt: 3.6 },
    { name: "Llama 3", cpt: 3.8 },
    { name: "Gemini 1.5", cpt: 4.0 },
  ];

  function countSentences(t) {
    const m = t.match(/[^.!?]+[.!?]+/g);
    return m ? m.length : (t.trim() ? 1 : 0);
  }

  function bytesUtf8(t) {
    try { return new TextEncoder().encode(t).length; }
    catch (e) { return t.length; }
  }

  function recalc() {
    const t = input.value;
    const chars = t.length;
    const noSpace = t.replace(/\\s/g, "").length;
    const words = t.trim() ? t.trim().split(/\\s+/).length : 0;
    const lines = t === "" ? 0 : t.split("\\n").length;
    const sents = countSentences(t);
    const bytes = bytesUtf8(t);

    $("s-chars").textContent = chars.toLocaleString();
    $("s-nospace").textContent = noSpace.toLocaleString();
    $("s-words").textContent = words.toLocaleString();
    $("s-lines").textContent = lines.toLocaleString();
    $("s-sents").textContent = sents.toLocaleString();
    $("s-bytes").textContent = bytes.toLocaleString();

    $("models").innerHTML = MODELS.map((m) => {
      const tok = chars === 0 ? 0 : Math.ceil(chars / m.cpt);
      return '<div class="kv-row"><span class="kv-k">' + m.name + '</span>' +
             '<span class="kv-v">~' + tok.toLocaleString() + ' tokens</span></div>';
    }).join("");
  }

  input.addEventListener("input", recalc);

  $("btn-sample").onclick = () => {
    input.value = "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!";
    recalc();
    status.textContent = "Sample loaded";
    status.className = "status ok";
  };

  $("btn-copy").onclick = () => {
    const t = input.value;
    const report =
      "characters: " + t.length +
      "\\nchars_no_spaces: " + t.replace(/\\s/g, "").length +
      "\\nwords: " + (t.trim() ? t.trim().split(/\\s+/).length : 0) +
      "\\nlines: " + (t === "" ? 0 : t.split("\\n").length) +
      "\\nsentences: " + countSentences(t) +
      "\\nbytes_utf8: " + bytesUtf8(t);
    navigator.clipboard.writeText(report);
    status.textContent = "Stats copied to clipboard";
    status.className = "status ok";
  };

  $("btn-clear").onclick = () => {
    input.value = "";
    recalc();
    status.textContent = "";
    status.className = "status";
  };

  recalc();
})();
`;

export function tokenCounterPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "token-counter",
    title: "Token Counter",
    intro:
      "Count characters, words, lines and sentences, and estimate LLM tokens " +
      "for popular model families — entirely in your browser. " +
      "The paid API endpoint for agents is at <code>POST /api/token-counter</code>.",
    howToUse: [
      "Paste or type your text into the editor.",
      "Read the character, word, line and sentence counts.",
      "Compare estimated LLM tokens across model families.",
      "Copy the numbers into your prompt-budget spreadsheet.",
    ],
    useCases: [
      "Staying inside a model context window before sending a prompt.",
      "Estimating API cost for a batch of documents.",
      "Checking article length for SEO or editorial limits.",
      "Agents budgeting prompts via the paid <code>POST /api/token-counter</code> endpoint.",
    ],
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
