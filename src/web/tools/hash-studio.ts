/**
 * Hash Studio — MD5* / SHA-1 / SHA-256 / SHA-384 / SHA-512 via WebCrypto.
 * (*MD5 is a small pure-JS implementation; WebCrypto has no MD5.)
 * 100% client-side: nothing is ever uploaded.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <label class="field-label" for="hash-input">Text to hash</label>
  <textarea id="hash-input" class="editor" rows="8" spellcheck="false"
    placeholder="Type or paste any text — the hashes update live."></textarea>

  <div class="toolbar">
    <button id="btn-copy-all" class="btn" type="button">Copy all</button>
    <label class="muted" style="display:inline-flex;align-items:center;gap:.4rem;margin-left:.5rem">
      <input id="chk-upper" type="checkbox"> uppercase
    </label>
    <span id="status" class="status" role="status"></span>
  </div>

  <div id="hash-rows"></div>
</div>
`;

const SCRIPT = `
(function () {
  var input = document.getElementById('hash-input');
  var rows = document.getElementById('hash-rows');
  var status = document.getElementById('status');
  var upper = document.getElementById('chk-upper');
  var copyAll = document.getElementById('btn-copy-all');

  var ALGOS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
  var results = {};

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }

  function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  // --- MD5 (RFC 1321), small pure-JS implementation ---
  function md5(str) {
    function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
    function au(x, y) { var l = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF); }
    function cmn(q, a, b, x, s, t) { return au(rl(au(au(a, q), au(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

    var utf8 = new TextEncoder().encode(str);
    var n = utf8.length;
    var bitLen = n * 8;
    var withOne = n + 1;
    var padLen = ((withOne + 8 + 63) & ~63);
    var buf = new Uint8Array(padLen);
    buf.set(utf8);
    buf[n] = 0x80;
    var view = new DataView(buf.buffer);
    view.setUint32(padLen - 8, bitLen >>> 0, true);
    view.setUint32(padLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (var i = 0; i < padLen; i += 64) {
      var M = new Array(16);
      for (var j = 0; j < 16; j++) M[j] = view.getInt32(i + j * 4, true);
      var aa = a, bb = b, cc = c, dd = d;
      a = ff(a, b, c, d, M[0], 7, -680876936); d = ff(d, a, b, c, M[1], 12, -389564586); c = ff(c, d, a, b, M[2], 17, 606105819); b = ff(b, c, d, a, M[3], 22, -1044525330);
      a = ff(a, b, c, d, M[4], 7, -176418897); d = ff(d, a, b, c, M[5], 12, 1200080426); c = ff(c, d, a, b, M[6], 17, -1473231341); b = ff(b, c, d, a, M[7], 22, -45705983);
      a = ff(a, b, c, d, M[8], 7, 1770035416); d = ff(d, a, b, c, M[9], 12, -1958414417); c = ff(c, d, a, b, M[10], 17, -42063); b = ff(b, c, d, a, M[11], 22, -1990404162);
      a = ff(a, b, c, d, M[12], 7, 1804603682); d = ff(d, a, b, c, M[13], 12, -40341101); c = ff(c, d, a, b, M[14], 17, -1502002290); b = ff(b, c, d, a, M[15], 22, 1236535329);
      a = gg(a, b, c, d, M[1], 5, -165796510); d = gg(d, a, b, c, M[6], 9, -1069501632); c = gg(c, d, a, b, M[11], 14, 643717713); b = gg(b, c, d, a, M[0], 20, -373897302);
      a = gg(a, b, c, d, M[5], 5, -701558691); d = gg(d, a, b, c, M[10], 9, 38016083); c = gg(c, d, a, b, M[15], 14, -660478335); b = gg(b, c, d, a, M[4], 20, -405537848);
      a = gg(a, b, c, d, M[9], 5, 568446438); d = gg(d, a, b, c, M[14], 9, -1019803690); c = gg(c, d, a, b, M[3], 14, -187363961); b = gg(b, c, d, a, M[8], 20, 1163531501);
      a = gg(a, b, c, d, M[13], 5, -1444681467); d = gg(d, a, b, c, M[2], 9, -51403784); c = gg(c, d, a, b, M[7], 14, 1735328473); b = gg(b, c, d, a, M[12], 20, -1926607734);
      a = hh(a, b, c, d, M[5], 4, -378558); d = hh(d, a, b, c, M[8], 11, -2022574463); c = hh(c, d, a, b, M[11], 16, 1839030562); b = hh(b, c, d, a, M[14], 23, -35309556);
      a = hh(a, b, c, d, M[1], 4, -1530992060); d = hh(d, a, b, c, M[4], 11, 1272893353); c = hh(c, d, a, b, M[7], 16, -155497632); b = hh(b, c, d, a, M[10], 23, -1094730640);
      a = hh(a, b, c, d, M[13], 4, 681279174); d = hh(d, a, b, c, M[0], 11, -358537222); c = hh(c, d, a, b, M[3], 16, -722521979); b = hh(b, c, d, a, M[6], 23, 76029189);
      a = hh(a, b, c, d, M[9], 4, -640364487); d = hh(d, a, b, c, M[12], 11, -421815835); c = hh(c, d, a, b, M[15], 16, 530742520); b = hh(b, c, d, a, M[2], 23, -995338651);
      a = ii(a, b, c, d, M[0], 6, -198630844); d = ii(d, a, b, c, M[7], 10, 1126891415); c = ii(c, d, a, b, M[14], 15, -1416354905); b = ii(b, c, d, a, M[5], 21, -57434055);
      a = ii(a, b, c, d, M[12], 6, 1700485571); d = ii(d, a, b, c, M[3], 10, -1894986606); c = ii(c, d, a, b, M[10], 15, -1051523); b = ii(b, c, d, a, M[1], 21, -2054922799);
      a = ii(a, b, c, d, M[8], 6, 1873313359); d = ii(d, a, b, c, M[15], 10, -30611744); c = ii(c, d, a, b, M[6], 15, -1560198380); b = ii(b, c, d, a, M[13], 21, 1309151649);
      a = ii(a, b, c, d, M[4], 6, -145523070); d = ii(d, a, b, c, M[11], 10, -1120210379); c = ii(c, d, a, b, M[2], 15, 718787259); b = ii(b, c, d, a, M[9], 21, -343485551);
      a = au(a, aa); b = au(b, bb); c = au(c, cc); d = au(d, dd);
    }
    function wordToHex(w) {
      var s = '';
      for (var i = 0; i < 4; i++) s += ((w >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
      return s;
    }
    return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
  }

  function renderRows() {
    if (!rows) return;
    var html = '';
    for (var i = 0; i < ALGOS.length; i++) {
      var alg = ALGOS[i];
      var val = results[alg] || '';
      var shown = upper && upper.checked ? val.toUpperCase() : val;
      html +=
        '<div class="hash-row" style="margin:.5rem 0">' +
          '<div class="field-label" style="margin-bottom:.2rem">' + alg + '</div>' +
          '<div style="display:flex;gap:.5rem;align-items:stretch">' +
            '<pre class="out" style="flex:1;margin:0;word-break:break-all;white-space:pre-wrap">' + (shown || '—') + '</pre>' +
            '<button class="btn" type="button" data-copy="' + alg + '">Copy</button>' +
          '</div>' +
        '</div>';
    }
    rows.innerHTML = html;
  }

  function compute() {
    var text = (input && input.value) || '';
    results['MD5'] = md5(text);

    var enc = new TextEncoder().encode(text);
    var jobs = [];
    var names = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    for (var i = 0; i < names.length; i++) {
      jobs.push(crypto.subtle.digest(names[i], enc).then(function (name) {
        return function (buf) {
          results[name] = toHex(new Uint8Array(buf));
        };
      }(names[i])));
    }
    Promise.all(jobs).then(function () {
      renderRows();
      setStatus(text.length + ' chars hashed', true);
    }).catch(function (e) {
      setStatus('Error: ' + e.message, false);
    });
  }

  if (input) input.addEventListener('input', compute);
  if (upper) upper.addEventListener('change', renderRows);

  if (copyAll) copyAll.addEventListener('click', function () {
    var lines = [];
    for (var i = 0; i < ALGOS.length; i++) {
      var v = results[ALGOS[i]] || '';
      lines.push(ALGOS[i] + ': ' + (upper && upper.checked ? v.toUpperCase() : v));
    }
    navigator.clipboard.writeText(lines.join('\\n')).then(
      function () { setStatus('All hashes copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  // Delegated copy buttons for each row
  if (rows) rows.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var alg = t.getAttribute('data-copy');
    if (!alg) return;
    var v = results[alg] || '';
    navigator.clipboard.writeText(upper && upper.checked ? v.toUpperCase() : v).then(
      function () { setStatus(alg + ' copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  // Seed with an empty run so all rows appear with em-dashes.
  results['MD5'] = md5('');
  renderRows();
  compute();
})();
`;

export function hashStudioPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "hash-studio",
    title: "Hash Studio",
    intro:
      "Compute MD5, SHA-1, SHA-256, SHA-384 and SHA-512 hashes of any text. Live update as you type, copy individual digests or all of them at once. Everything runs locally in your browser via WebCrypto — your input never leaves your device.",
    howToUse: [
      "Type or paste your text into the field.",
      "Watch MD5, SHA-1, SHA-256, SHA-384 and SHA-512 digests update live.",
      "Copy an individual hash or all of them at once.",
    ],
    useCases: [
      "Verifying a checksum you received alongside a file.",
      "Generating a quick content fingerprint.",
      "Comparing digests without uploading anything to a server.",
    ],
    body: BODY,
    script: SCRIPT,
  });
}
