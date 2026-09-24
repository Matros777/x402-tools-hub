/**
 * Env Studio — parse, inspect and convert .env files.
 * 100% client-side: nothing is ever uploaded.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <label class="field-label" for="env-input">.env content</label>
  <textarea id="env-input" class="editor" rows="12" spellcheck="false"
    placeholder="DATABASE_URL=postgres://user:pass@localhost:5432/db&#10;API_KEY=&quot;sk-...&quot;&#10;# comment&#10;DEBUG=true"></textarea>

  <div class="toolbar">
    <button id="btn-json" class="btn btn-primary" type="button">JSON</button>
    <button id="btn-yaml" class="btn" type="button">YAML</button>
    <button id="btn-docker" class="btn" type="button">docker-compose</button>
    <button id="btn-shell" class="btn" type="button">export</button>
    <button id="btn-mask" class="btn" type="button">Mask secrets</button>
    <button id="btn-copy" class="btn" type="button">Copy output</button>
    <span id="status" class="status" role="status"></span>
  </div>

  <div class="grid-2">
    <div>
      <label class="field-label">Parsed keys <span id="count" class="muted"></span></label>
      <div id="table" class="out out-wrap" style="min-height:120px"></div>
    </div>
    <div>
      <label class="field-label" for="env-output">Output</label>
      <pre id="env-output" class="out out-wrap" style="min-height:120px"></pre>
    </div>
  </div>
</div>
`;

const SCRIPT = `
(function () {
  var input = document.getElementById('env-input');
  var output = document.getElementById('env-output');
  var table = document.getElementById('table');
  var count = document.getElementById('count');
  var status = document.getElementById('status');

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }

  // Split a KEY=VALUE line, honouring single/double quotes and inline comments.
  function parseLine(line) {
    var t = line.trim();
    if (!t || t.charAt(0) === '#') return null;
    var eq = t.indexOf('=');
    if (eq === -1) return { key: t, value: '', bare: true };
    var key = t.slice(0, eq).trim();
    var raw = t.slice(eq + 1).trim();
    var value = raw;
    var quote = raw.charAt(0);
    if (quote === '"' || quote === "'") {
      var end = raw.indexOf(quote, 1);
      value = end === -1 ? raw.slice(1) : raw.slice(1, end);
    } else {
      var hash = raw.indexOf(' #');
      if (hash !== -1) value = raw.slice(0, hash).trim();
    }
    return { key: key, value: value, bare: false };
  }

  function parseAll() {
    var text = (input && input.value) || '';
    var lines = text.split(/\r?\n/);
    var pairs = [];
    var dupes = {};
    for (var i = 0; i < lines.length; i++) {
      var p = parseLine(lines[i]);
      if (!p) continue;
      if (dupes[p.key]) p.dupe = true;
      dupes[p.key] = true;
      pairs.push(p);
    }
    return pairs;
  }

  function renderTable(pairs) {
    if (!table) return;
    if (!pairs.length) {
      table.textContent = '(no keys parsed)';
      if (count) count.textContent = '';
      return;
    }
    var html = '';
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var flag = p.dupe ? ' <span style="color:#ffb454">dup</span>' : '';
      var safeKey = String(p.key).replace(/[<>&]/g, '');
      var safeVal = String(p.value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += '<div><span class="muted">' + safeKey + '</span>' + flag + ' = ' + safeVal + '</div>';
    }
    table.innerHTML = html;
    if (count) count.textContent = '(' + pairs.length + ')';
  }

  function toJSON(pairs) {
    var obj = {};
    for (var i = 0; i < pairs.length; i++) obj[pairs[i].key] = pairs[i].value;
    return JSON.stringify(obj, null, 2);
  }

  function toYAML(pairs) {
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      var v = pairs[i].value;
      var needsQuote = v === '' || /[:#\-{}\[\],&*!|>'"%@]/.test(v) || /^\s|\s$/.test(v);
      out.push(pairs[i].key + ': ' + (needsQuote ? JSON.stringify(v) : v));
    }
    return out.join('\n');
  }

  function toDocker(pairs) {
    var out = ['services:', '  app:', '    environment:'];
    for (var i = 0; i < pairs.length; i++) {
      out.push('      - ' + pairs[i].key + '=' + pairs[i].value);
    }
    return out.join('\n');
  }

  function toShell(pairs) {
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      out.push('export ' + pairs[i].key + '=' + JSON.stringify(pairs[i].value));
    }
    return out.join('\n');
  }

  function isSecret(key) {
    return /(pass|secret|token|key|pwd|credential|auth)/i.test(key);
  }

  function toMasked(pairs) {
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      out.push(p.key + '=' + (isSecret(p.key) && p.value ? '********' : p.value));
    }
    return out.join('\n');
  }

  function run(mode) {
    var pairs = parseAll();
    renderTable(pairs);
    if (!output) return;
    if (mode === 'json') output.textContent = toJSON(pairs);
    else if (mode === 'yaml') output.textContent = toYAML(pairs);
    else if (mode === 'docker') output.textContent = toDocker(pairs);
    else if (mode === 'shell') output.textContent = toShell(pairs);
    else if (mode === 'mask') output.textContent = toMasked(pairs);
    setStatus(pairs.length + ' keys', true);
  }

  var buttons = [
    ['btn-json', 'json'], ['btn-yaml', 'yaml'], ['btn-docker', 'docker'],
    ['btn-shell', 'shell'], ['btn-mask', 'mask']
  ];
  buttons.forEach(function (b) {
    var el = document.getElementById(b[0]);
    if (el) el.addEventListener('click', function () { run(b[1]); });
  });

  var copyBtn = document.getElementById('btn-copy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    if (!output) return;
    navigator.clipboard.writeText(output.textContent || '').then(
      function () { setStatus('Copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  if (input) input.addEventListener('input', function () { run('json'); });
  run('json');
})();
`;

export function envStudioPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "env-studio",
    title: "Env Studio",
    intro:
      "Paste a .env file to inspect every key, spot duplicate entries and convert to JSON, YAML, docker-compose or shell exports. Secrets can be masked before you share. Everything runs locally in your browser — your environment never leaves your device.",
    howToUse: [
      "Paste a .env file into the editor.",
      "Inspect every key and spot duplicate entries.",
      "Convert to JSON, YAML, docker-compose or shell exports.",
      "Mask secrets before sharing a screenshot or snippet.",
    ],
    useCases: [
      "Auditing a .env file for duplicates or typos.",
      "Translating config between docker-compose and shell formats.",
      "Sanitising environment variables before sharing them.",
    ],
    body: BODY,
    script: SCRIPT,
  });
}
