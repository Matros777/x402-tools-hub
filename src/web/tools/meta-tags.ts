/**
 * Meta Tags — SEO / OpenGraph / Twitter Card generator with live preview.
 * 100% client-side: nothing is ever uploaded.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="grid-2">
    <div>
      <label class="field-label" for="mt-title">Title</label>
      <input id="mt-title" class="input" type="text" value="Your page title" spellcheck="false">

      <label class="field-label" style="margin-top:.5rem" for="mt-desc">Description</label>
      <textarea id="mt-desc" class="editor" rows="3" spellcheck="false">A short description of your page for search engines and social previews.</textarea>

      <label class="field-label" style="margin-top:.5rem" for="mt-url">Canonical URL</label>
      <input id="mt-url" class="input" type="text" value="https://example.com/page" spellcheck="false">

      <label class="field-label" style="margin-top:.5rem" for="mt-img">OG image URL</label>
      <input id="mt-img" class="input" type="text" value="https://example.com/og.png" spellcheck="false">

      <label class="field-label" style="margin-top:.5rem" for="mt-type">OG type</label>
      <select id="mt-type" class="select">
        <option value="website">website</option>
        <option value="article">article</option>
        <option value="product">product</option>
        <option value="profile">profile</option>
      </select>

      <label class="field-label" style="margin-top:.5rem" for="mt-tw">Twitter card</label>
      <select id="mt-tw" class="select">
        <option value="summary_large_image">summary_large_image</option>
        <option value="summary">summary</option>
      </select>

      <label class="field-label" style="margin-top:.5rem" for="mt-author">Author / site name (optional)</label>
      <input id="mt-author" class="input" type="text" value="" spellcheck="false" placeholder="@yourhandle or Site Name">
    </div>
    <div>
      <label class="field-label">Live preview</label>
      <div id="mt-preview" class="out out-wrap" style="min-height:170px"></div>
      <div class="muted" style="margin-top:.35rem">Title length: <span id="mt-len-title">0</span> · Description: <span id="mt-len-desc">0</span></div>
    </div>
  </div>

  <div class="toolbar" style="margin-top:.5rem">
    <button id="mt-copy" class="btn btn-primary" type="button">Copy meta tags</button>
    <button id="mt-copy-jsonld" class="btn" type="button">Copy JSON-LD</button>
    <span id="status" class="status" role="status"></span>
  </div>

  <label class="field-label" style="margin-top:.5rem">HTML</label>
  <pre id="mt-out" class="out out-wrap" style="min-height:220px"></pre>
</div>
`;

const SCRIPT = `
(function () {
  var titleEl = document.getElementById('mt-title');
  var descEl = document.getElementById('mt-desc');
  var urlEl = document.getElementById('mt-url');
  var imgEl = document.getElementById('mt-img');
  var typeEl = document.getElementById('mt-type');
  var twEl = document.getElementById('mt-tw');
  var authorEl = document.getElementById('mt-author');
  var out = document.getElementById('mt-out');
  var preview = document.getElementById('mt-preview');
  var lenTitle = document.getElementById('mt-len-title');
  var lenDesc = document.getElementById('mt-len-desc');
  var status = document.getElementById('status');
  var copyBtn = document.getElementById('mt-copy');
  var copyJsonLdBtn = document.getElementById('mt-copy-jsonld');

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function current() {
    return {
      title: titleEl.value || '',
      desc: descEl.value || '',
      url: urlEl.value || '',
      img: imgEl.value || '',
      type: typeEl.value,
      tw: twEl.value,
      author: authorEl.value || '',
    };
  }

  function buildMeta(v) {
    var lines = [];
    lines.push('<meta charset="utf-8">');
    lines.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
    lines.push('<title>' + esc(v.title) + '</title>');
    if (v.desc) lines.push('<meta name="description" content="' + esc(v.desc) + '">');
    if (v.author) lines.push('<meta name="author" content="' + esc(v.author) + '">');
    if (v.url) {
      lines.push('<link rel="canonical" href="' + esc(v.url) + '">');
    }
    lines.push('');
    lines.push('<!-- Open Graph -->');
    lines.push('<meta property="og:title" content="' + esc(v.title) + '">');
    if (v.desc) lines.push('<meta property="og:description" content="' + esc(v.desc) + '">');
    lines.push('<meta property="og:type" content="' + esc(v.type) + '">');
    if (v.url) lines.push('<meta property="og:url" content="' + esc(v.url) + '">');
    if (v.img) lines.push('<meta property="og:image" content="' + esc(v.img) + '">');
    if (v.author) lines.push('<meta property="og:site_name" content="' + esc(v.author) + '">');
    lines.push('');
    lines.push('<!-- Twitter -->');
    lines.push('<meta name="twitter:card" content="' + esc(v.tw) + '">');
    lines.push('<meta name="twitter:title" content="' + esc(v.title) + '">');
    if (v.desc) lines.push('<meta name="twitter:description" content="' + esc(v.desc) + '">');
    if (v.img) lines.push('<meta name="twitter:image" content="' + esc(v.img) + '">');
    return lines.join('\\n');
  }

  function buildJsonLd(v) {
    var obj = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: v.title,
      description: v.desc,
    };
    if (v.url) obj.url = v.url;
    if (v.img) obj.image = v.img;
    if (v.author) obj.publisher = { '@type': 'Organization', name: v.author };
    return '<script type="application/ld+json">\\n' + JSON.stringify(obj, null, 2) + '\\n<\\/script>';
  }

  function renderPreview(v) {
    if (!preview) return;
    var img = v.img ? '<div style="width:100%;height:70px;border-radius:6px;background:linear-gradient(135deg,#10e0a0,#0b6b52);margin-bottom:.4rem"></div>' : '';
    var host = '';
    try { host = v.url ? new URL(v.url).host : ''; } catch (e) { host = ''; }
    preview.innerHTML =
      '<div style="border:1px solid #234;border-radius:8px;padding:.6rem;background:#0c1a15">' +
        img +
        '<div class="muted" style="font-size:.75rem">' + esc(host || 'example.com') + '</div>' +
        '<div style="font-size:1rem;color:#7fe6c2;margin:.15rem 0">' + esc(v.title || 'Title') + '</div>' +
        '<div class="muted" style="font-size:.85rem">' + esc(v.desc || 'Description') + '</div>' +
      '</div>';
  }

  function run() {
    var v = current();
    if (lenTitle) lenTitle.textContent = v.title.length;
    if (lenDesc) lenDesc.textContent = v.desc.length;
    out.textContent = buildMeta(v);
    renderPreview(v);
    var warn = [];
    if (v.title.length > 60) warn.push('title > 60 chars');
    if (v.desc.length > 160) warn.push('description > 160 chars');
    setStatus(warn.length ? warn.join(', ') : 'ok', warn.length === 0);
  }

  ['mt-title','mt-desc','mt-url','mt-img','mt-author'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', run);
  });
  if (typeEl) typeEl.addEventListener('change', run);
  if (twEl) twEl.addEventListener('change', run);

  if (copyBtn) copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(buildMeta(current())).then(
      function () { setStatus('Meta copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });
  if (copyJsonLdBtn) copyJsonLdBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(buildJsonLd(current())).then(
      function () { setStatus('JSON-LD copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  run();
})();
`;

export function metaTagsPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "meta-tags",
    title: "Meta Tags Studio",
    intro:
      "Generate SEO, OpenGraph and Twitter Card meta tags with a live social preview and length warnings. Copy the HTML or a JSON-LD block. Everything runs locally in your browser.",
    body: BODY,
    script: SCRIPT,
  });
}
