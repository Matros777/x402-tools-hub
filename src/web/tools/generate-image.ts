/**
 * x402 Tools Hub — Image Generator tool page
 * Free web form for humans: prompt + size + style -> generated image.
 * Agents use the paid POST /api/generate-image endpoint ($0.003).
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";
import {
  IMAGE_SIZES,
  IMAGE_SIZE_LABELS,
  IMAGE_STYLES,
  IMAGE_STYLE_LABELS,
} from "../../image-core";

const IMG_SCRIPT = `
(function () {
  var qEl = document.getElementById('img-prompt');
  var sizeEl = document.getElementById('img-size');
  var styleEl = document.getElementById('img-style');
  var btn = document.getElementById('img-run');
  var status = document.getElementById('img-status');
  var out = document.getElementById('img-out');
  var endpoint = '/api/generate-image/lookup';

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

  function dataUrl(d) {
    if (!d || !d.ok || !d.image) return null;
    var mime = d.mime || 'image/jpeg';
    if (d.image.indexOf('http') === 0) return d.image;
    return 'data:' + mime + ';base64,' + d.image;
  }

  function run() {
    var prompt = (qEl ? qEl.value : '').trim();
    if (!prompt) { setStatus('Enter a prompt first', false); return; }
    var size = sizeEl ? sizeEl.value : '1024x1024';
    var style = styleEl ? styleEl.value : 'none';
    setStatus('Generating… (can take ~30-60s)', true);
    out.innerHTML = '<div class="img-generating">Generating…</div>';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, size: size, style: style }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) {
          setStatus((d && d.error) || 'Generation failed', false);
          out.innerHTML = '';
          return;
        }
        var src = dataUrl(d);
        if (!src) { setStatus('No image in response', false); out.innerHTML = ''; return; }
        var meta = [];
        meta.push(esc(size));
        if (style && style !== 'none') meta.push(esc(style));
        if (d.id) meta.push('id ' + esc(d.id));
        out.innerHTML =
          '<img class="img-result" src="' + src + '" alt="' + esc(prompt) + '">' +
          '<div class="news-meta">' + meta.join(' · ') + '</div>' +
          '<div class="toolbar"><a class="btn btn-primary" href="' + src + '" download="x402-image-' + (d.id ? esc(d.id) : Date.now()) + '.jpg">Download</a></div>';
        setStatus('OK · generated', true);
      })
      .catch(function () { setStatus('Network error', false); out.innerHTML = ''; });
  }

  btn.addEventListener('click', run);
  qEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
`;

function optionsHtml(selectId: string, values: readonly string[], labels: Record<string, string>): string {
  return values
    .map((v) => `<option value="${v}">${labels[v]}</option>`)
    .join("");
}

export function generateImagePage(cfg: AppConfig): string {
  const body = `
    <div class="studio">
      <label class="field-label" for="img-prompt">Prompt</label>
      <textarea id="img-prompt" class="editor" rows="4" spellcheck="false" placeholder="A futuristic city skyline at sunset with flying cars…"></textarea>

      <div class="form-row">
        <label class="field-label" for="img-size">Aspect ratio / size</label>
        <select id="img-size" class="input">${optionsHtml("img-size", IMAGE_SIZES, IMAGE_SIZE_LABELS)}</select>
      </div>

      <div class="form-row">
        <label class="field-label" for="img-style">Style</label>
        <select id="img-style" class="input">${optionsHtml("img-style", IMAGE_STYLES, IMAGE_STYLE_LABELS)}</select>
      </div>

      <div class="toolbar">
        <button id="img-run" class="btn btn-primary" type="button">Generate</button>
        <span id="img-status" class="status" role="status"></span>
      </div>

      <div id="img-out"></div>
    </div>
  `;

  return renderToolPage(cfg, {
    name: "generate-image",
    title: "Image Generator",
    intro:
      "Text-to-image generation powered by ASI:One. Type a prompt, pick an aspect ratio and a style preset, and get a generated image in seconds. Free for humans on this page.",
    howToUse: [
      'Describe what you want in the prompt box (e.g. "a red fox in a snowy forest, morning light").',
      'Pick an aspect ratio: 1:1 square, 16:9 landscape or 9:16 portrait.',
      "Pick a style preset — photorealistic, cinematic, anime, 3D, watercolor, oil, cyberpunk or minimal.",
      'Hit Generate — the image appears below and can be downloaded.',
      "Agents call the paid POST /api/generate-image endpoint ($0.003 per image).",
    ],
    useCases: [
      "Cover images and banners for agent projects or docs.",
      "Quick concept art or moodboards from a text description.",
      "Feed a generated image URL into an agent pipeline (paid API).",
    ],
    body,
    script: IMG_SCRIPT,
  });
}