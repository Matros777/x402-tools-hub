/**
 * x402 Tools Hub — new-tool template
 *
 * HOW TO ADD A TOOL (see PLAN-100-TOOLS.md):
 *
 * 1. Copy this file to src/web/tools/<slug>.ts (e.g. src/web/tools/slugify.ts).
 * 2. Rename the exported function to <camelSlug>Page (e.g. slugifyPage).
 * 3. Fill in `intro`, `body`, and `script` below. Every calculation must run
 *    in the browser — never send user input to the server.
 * 4. Add the tool to TOOLS in src/config.ts (path, priceUsd, description,
 *    icon, freeForHumans, category).
 * 5. Register it in src/index.ts:
 *      - import { slugifyPage } from "./web/tools/slugify";
 *      - add `"slugify": slugifyPage,` to TOOL_PAGES
 *      - add a POST /api/slugify handler (paid, for agents)
 * 6. Run `npx tsc --noEmit`, then test in the browser.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

export function templatePage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "<slug>",
    title: "<Human Readable Title>",
    intro:
      "One-paragraph description of what this tool does and why it runs locally.",

    body: `
      <div class="studio">
        <label class="field-label" for="input">Input</label>
        <textarea id="input" class="editor" rows="8" spellcheck="false" placeholder="Paste text here…"></textarea>

        <div class="toolbar">
          <button id="run" class="btn btn-primary" type="button">Run</button>
          <button id="copy" class="btn" type="button">Copy</button>
          <span id="status" class="status" role="status"></span>
        </div>

        <label class="field-label" for="output">Output</label>
        <pre id="output" class="out"></pre>
      </div>
    `,

    script: `
(function () {
  var input = document.getElementById('input');
  var output = document.getElementById('output');
  var runBtn = document.getElementById('run');
  var copyBtn = document.getElementById('copy');
  var status = document.getElementById('status');

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }

  function run() {
    if (!input || !output) return;
    var value = input.value || '';
    // TODO: implement the actual transformation here.
    output.textContent = value;
    setStatus('Done', true);
  }

  if (runBtn) runBtn.addEventListener('click', run);
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      if (!output) return;
      navigator.clipboard.writeText(output.textContent || '').then(
        function () { setStatus('Copied', true); },
        function () { setStatus('Copy failed', false); }
      );
    });
  }
})();
`,
  });
}
