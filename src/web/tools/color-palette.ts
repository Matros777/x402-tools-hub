/**
 * Color Palette Studio — HEX / RGB / HSL, WCAG contrast, CSS/Tailwind export.
 * 100% client-side: nothing is ever uploaded.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <label class="field-label" for="color-input">Base color (hex or rgb)</label>
  <div class="toolbar">
    <input id="color-input" class="input" type="text" value="#10e0a0" spellcheck="false" style="max-width:200px">
    <input id="color-pick" type="color" value="#10e0a0" style="width:48px;height:34px;border:none;background:transparent">
    <button id="btn-random" class="btn" type="button">Random</button>
    <button id="btn-copy-css" class="btn" type="button">Copy CSS vars</button>
    <button id="btn-copy-tailwind" class="btn" type="button">Copy Tailwind</button>
    <span id="status" class="status" role="status"></span>
  </div>

  <div id="color-formats" class="out out-wrap" style="margin:.5rem 0"></div>

  <label class="field-label">Palette</label>
  <div id="palette" style="display:flex;flex-wrap:wrap;gap:.5rem"></div>

  <label class="field-label" style="margin-top:1rem">WCAG contrast vs base</label>
  <div id="contrast" class="out out-wrap"></div>

  <label class="field-label" style="margin-top:1rem">Preview</label>
  <div id="preview" style="padding:1rem;border-radius:10px;border:1px solid #234">
    The quick brown fox jumps over the lazy dog.
  </div>
</div>
`;

const SCRIPT = `
(function () {
  var input = document.getElementById('color-input');
  var pick = document.getElementById('color-pick');
  var palette = document.getElementById('palette');
  var formats = document.getElementById('color-formats');
  var contrast = document.getElementById('contrast');
  var preview = document.getElementById('preview');
  var status = document.getElementById('status');
  var randomBtn = document.getElementById('btn-random');
  var copyCss = document.getElementById('btn-copy-css');
  var copyTw = document.getElementById('btn-copy-tailwind');

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function parseColor(str) {
    if (!str) return null;
    var s = String(str).trim().toLowerCase();
    var m;
    if ((m = s.match(/^#?([0-9a-f]{3})$/))) {
      var h = m[1];
      return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16) };
    }
    if ((m = s.match(/^#?([0-9a-f]{6})$/))) {
      var h6 = m[1];
      return { r: parseInt(h6.slice(0,2),16), g: parseInt(h6.slice(2,4),16), b: parseInt(h6.slice(4,6),16) };
    }
    if ((m = s.match(/^rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/))) {
      return { r: clamp(+m[1],0,255), g: clamp(+m[2],0,255), b: clamp(+m[3],0,255) };
    }
    return null;
  }

  function toHex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  function toRgb(c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'; }

  function toHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return 'hsl(' + Math.round(h * 360) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)';
  }

  function luminance(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  function contrastRatio(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  function mix(a, b, t) {
    return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
  }

  function shift(c, dh, ds, dl) {
    // quick HSL shift via built-in round trip
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    h = (h + dh / 360 + 1) % 1;
    s = clamp(s + ds / 100, 0, 1);
    l = clamp(l + dl / 100, 0, 1);
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
    };
  }

  var state = { base: { r: 16, g: 224, b: 160 }, shades: [] };

  function computeShades() {
    var b = state.base;
    state.shades = [
      { name: '50',  c: mix(b, { r: 255, g: 255, b: 255 }, 0.92) },
      { name: '100', c: mix(b, { r: 255, g: 255, b: 255 }, 0.80) },
      { name: '200', c: mix(b, { r: 255, g: 255, b: 255 }, 0.60) },
      { name: '300', c: mix(b, { r: 255, g: 255, b: 255 }, 0.35) },
      { name: '400', c: shift(b, 0, 5, 8) },
      { name: '500', c: b },
      { name: '600', c: shift(b, 0, -5, -8) },
      { name: '700', c: mix(b, { r: 0, g: 0, b: 0 }, 0.30) },
      { name: '800', c: mix(b, { r: 0, g: 0, b: 0 }, 0.55) },
      { name: '900', c: mix(b, { r: 0, g: 0, b: 0 }, 0.75) },
    ];
  }

  function render() {
    var b = state.base;
    computeShades();

    if (formats) {
      formats.innerHTML =
        '<div><span class="muted">HEX</span> ' + toHex(b) + '</div>' +
        '<div><span class="muted">RGB</span> ' + toRgb(b) + '</div>' +
        '<div><span class="muted">HSL</span> ' + toHsl(b) + '</div>';
    }

    if (palette) {
      var html = '';
      for (var i = 0; i < state.shades.length; i++) {
        var s = state.shades[i];
        var hex = toHex(s.c);
        html += '<div style="flex:0 0 auto;text-align:center">' +
          '<div data-copy="' + hex + '" title="Click to copy ' + hex + '" style="width:64px;height:48px;border-radius:8px;background:' + hex + ';border:1px solid #234;cursor:pointer"></div>' +
          '<div class="muted" style="font-size:.75rem;margin-top:.2rem">' + s.name + '</div>' +
        '</div>';
      }
      palette.innerHTML = html;
    }

    if (contrast) {
      var white = { r: 255, g: 255, b: 255 };
      var black = { r: 0, g: 0, b: 0 };
      var cw = contrastRatio(b, white);
      var cb = contrastRatio(b, black);
      function badge(ratio, label) {
        var aa = ratio >= 4.5, aaa = ratio >= 7;
        return '<div style="margin:.25rem 0">' + label + ': <b>' + ratio.toFixed(2) + ':1</b> ' +
          (aaa ? '<span style="color:#10e0a0">AAA</span>' : aa ? '<span style="color:#10e0a0">AA</span>' : '<span style="color:#ffb454">fail</span>') +
          '</div>';
      }
      contrast.innerHTML = badge(cw, 'on white') + badge(cb, 'on black');
    }

    if (preview) {
      preview.style.background = toHex(b);
      var onWhite = contrastRatio(b, { r: 255, g: 255, b: 255 }) >= 4.5;
      preview.style.color = onWhite ? '#0b0f0e' : '#f2fff9';
    }

    if (pick) pick.value = toHex(b);
    if (input) input.value = toHex(b);
  }

  function setBase(str) {
    var c = parseColor(str);
    if (!c) { setStatus('Invalid color', false); return; }
    state.base = c;
    render();
    setStatus('ok', true);
  }

  if (input) input.addEventListener('input', function () { setBase(input.value); });
  if (pick) pick.addEventListener('input', function () { setBase(pick.value); });

  if (randomBtn) randomBtn.addEventListener('click', function () {
    state.base = {
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
    };
    render();
    setStatus('random', true);
  });

  if (palette) palette.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var hex = t.getAttribute('data-copy');
    if (!hex) return;
    navigator.clipboard.writeText(hex).then(
      function () { setStatus(hex + ' copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  function cssVars() {
    var lines = ['/* ' + toHex(state.base) + ' */', ':root {'];
    for (var i = 0; i < state.shades.length; i++) {
      lines.push('  --brand-' + state.shades[i].name + ': ' + toHex(state.shades[i].c) + ';');
    }
    lines.push('}');
    return lines.join('\\n');
  }

  function tailwindCfg() {
    var lines = ['// tailwind.config.js (excerpt)', 'colors: {', '  brand: {'];
    for (var i = 0; i < state.shades.length; i++) {
      lines.push("    '" + state.shades[i].name + "': '" + toHex(state.shades[i].c) + "',");
    }
    lines.push('  },', '},');
    return lines.join('\\n');
  }

  if (copyCss) copyCss.addEventListener('click', function () {
    navigator.clipboard.writeText(cssVars()).then(
      function () { setStatus('CSS copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  if (copyTw) copyTw.addEventListener('click', function () {
    navigator.clipboard.writeText(tailwindCfg()).then(
      function () { setStatus('Tailwind copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  render();
})();
`;

export function colorPalettePage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "color-palette",
    title: "Color Palette Studio",
    intro:
      "Pick a base color to get HEX / RGB / HSL values, a 10-step shade palette, WCAG contrast checks against white and black, and one-click export to CSS variables or Tailwind config. Everything runs locally in your browser.",
    body: BODY,
    script: SCRIPT,
  });
}
