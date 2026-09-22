/**
 * Unit Converter — length / weight / volume / temperature / area / speed.
 * 100% client-side: nothing is ever uploaded.
 */

import { renderToolPage } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <label class="field-label" for="uc-cat">Category</label>
  <select id="uc-cat" class="select">
    <option value="length">Length</option>
    <option value="weight">Weight / Mass</option>
    <option value="volume">Volume</option>
    <option value="temperature">Temperature</option>
    <option value="area">Area</option>
    <option value="speed">Speed</option>
    <option value="data">Digital Data</option>
  </select>

  <div class="grid-2" style="margin-top:.75rem">
    <div>
      <label class="field-label" for="uc-from">From</label>
      <input id="uc-from" class="input" type="text" value="1" spellcheck="false">
      <select id="uc-from-unit" class="select" style="margin-top:.4rem"></select>
    </div>
    <div>
      <label class="field-label" for="uc-to">To</label>
      <input id="uc-to" class="input" type="text" spellcheck="false" readonly>
      <select id="uc-to-unit" class="select" style="margin-top:.4rem"></select>
    </div>
  </div>

  <div class="toolbar" style="margin-top:.5rem">
    <button id="uc-swap" class="btn" type="button">Swap</button>
    <button id="uc-copy" class="btn" type="button">Copy result</button>
    <span id="status" class="status" role="status"></span>
  </div>

  <label class="field-label" style="margin-top:.75rem">All units</label>
  <pre id="uc-all" class="out out-wrap" style="min-height:140px"></pre>
</div>
`;

const SCRIPT = `
(function () {
  // Factor to a base unit within each category.
  // Temperature is special (offset), handled separately.
  var UNITS = {
    length: {
      base: 'm',
      units: {
        'nanometer': 1e-9, 'micrometer': 1e-6, 'millimeter': 1e-3, 'centimeter': 1e-2,
        'meter': 1, 'kilometer': 1000,
        'inch': 0.0254, 'foot': 0.3048, 'yard': 0.9144, 'mile': 1609.344,
        'nautical mile': 1852,
      },
    },
    weight: {
      base: 'kg',
      units: {
        'microgram': 1e-9, 'milligram': 1e-6, 'gram': 1e-3, 'kilogram': 1,
        'tonne': 1000, 'ounce': 0.028349523125, 'pound': 0.45359237,
        'stone': 6.35029318, 'US ton': 907.18474,
      },
    },
    volume: {
      base: 'L',
      units: {
        'milliliter': 1e-3, 'liter': 1, 'cubic meter': 1000,
        'teaspoon (US)': 0.00492892159375,
        'tablespoon (US)': 0.01478676478125,
        'fluid ounce (US)': 0.0295735295625,
        'cup (US)': 0.2365882365,
        'pint (US)': 0.473176473,
        'quart (US)': 0.946352946,
        'gallon (US)': 3.785411784,
        'gallon (UK)': 4.54609,
      },
    },
    area: {
      base: 'm2',
      units: {
        'square millimeter': 1e-6, 'square centimeter': 1e-4,
        'square meter': 1, 'square kilometer': 1e6,
        'square inch': 0.00064516, 'square foot': 0.09290304,
        'square yard': 0.83612736, 'acre': 4046.8564224, 'hectare': 10000,
      },
    },
    speed: {
      base: 'm/s',
      units: {
        'meter/second': 1, 'kilometer/hour': 1/3.6, 'mile/hour': 0.44704,
        'knot': 0.514444444, 'foot/second': 0.3048, 'mach': 340.29,
      },
    },
    data: {
      base: 'byte',
      units: {
        'bit': 0.125, 'byte': 1, 'kilobyte (1000)': 1e3, 'kibibyte (1024)': 1024,
        'megabyte (1000^2)': 1e6, 'mebibyte (1024^2)': 1048576,
        'gigabyte (1000^3)': 1e9, 'gibibyte (1024^3)': 1073741824,
        'terabyte (1000^4)': 1e12, 'tebibyte (1024^4)': 1099511627776,
      },
    },
    temperature: {
      special: true,
      units: ['celsius', 'fahrenheit', 'kelvin'],
    },
  };

  var catEl = document.getElementById('uc-cat');
  var fromEl = document.getElementById('uc-from');
  var toEl = document.getElementById('uc-to');
  var fromUnitEl = document.getElementById('uc-from-unit');
  var toUnitEl = document.getElementById('uc-to-unit');
  var swapBtn = document.getElementById('uc-swap');
  var copyBtn = document.getElementById('uc-copy');
  var allEl = document.getElementById('uc-all');
  var status = document.getElementById('status');

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('status-ok', !!ok);
    status.classList.toggle('status-err', !ok);
  }

  function fillUnits() {
    var cat = UNITS[catEl.value];
    if (!cat) return;
    var names = cat.special ? cat.units.slice() : Object.keys(cat.units);
    fromUnitEl.innerHTML = '';
    toUnitEl.innerHTML = '';
    names.forEach(function (n) {
      var o1 = document.createElement('option'); o1.value = n; o1.textContent = n;
      var o2 = document.createElement('option'); o2.value = n; o2.textContent = n;
      fromUnitEl.appendChild(o1);
      toUnitEl.appendChild(o2);
    });
    fromUnitEl.value = names[0];
    toUnitEl.value = names[Math.min(1, names.length - 1)];
  }

  function tempToCelsius(v, from) {
    if (from === 'celsius') return v;
    if (from === 'fahrenheit') return (v - 32) * 5 / 9;
    if (from === 'kelvin') return v - 273.15;
    return v;
  }
  function celsiusTo(v, to) {
    if (to === 'celsius') return v;
    if (to === 'fahrenheit') return v * 9 / 5 + 32;
    if (to === 'kelvin') return v + 273.15;
    return v;
  }

  function convert(value, from, to) {
    var cat = UNITS[catEl.value];
    if (!cat) return NaN;
    if (cat.special) return celsiusTo(tempToCelsius(value, from), to);
    var fFrom = cat.units[from];
    var fTo = cat.units[to];
    if (!fFrom || !fTo) return NaN;
    return value * fFrom / fTo;
  }

  function fmt(n) {
    if (!isFinite(n)) return '—';
    if (n === 0) return '0';
    var abs = Math.abs(n);
    if (abs >= 1e15 || abs < 1e-9) return n.toExponential(6);
    var s = n.toPrecision(12);
    if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function renderAll(baseVal, from) {
    var cat = UNITS[catEl.value];
    if (!cat) { allEl.textContent = ''; return; }
    var names = cat.special ? cat.units.slice() : Object.keys(cat.units);
    var lines = [];
    for (var i = 0; i < names.length; i++) {
      var u = names[i];
      var v = convert(baseVal, from, u);
      lines.push(pad(u, 22) + fmt(v));
    }
    allEl.textContent = lines.join('\\n');
  }

  function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
  }

  function run() {
    var v = parseFloat(fromEl.value);
    if (!isFinite(v)) { toEl.value = '—'; allEl.textContent = ''; setStatus('Enter a number', false); return; }
    var out = convert(v, fromUnitEl.value, toUnitEl.value);
    toEl.value = fmt(out);
    renderAll(v, fromUnitEl.value);
    setStatus(fromUnitEl.value + ' → ' + toUnitEl.value, true);
  }

  catEl.addEventListener('change', function () { fillUnits(); run(); });
  fromEl.addEventListener('input', run);
  fromUnitEl.addEventListener('change', run);
  toUnitEl.addEventListener('change', run);

  swapBtn.addEventListener('click', function () {
    var a = fromUnitEl.value; fromUnitEl.value = toUnitEl.value; toUnitEl.value = a;
    run();
  });

  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(toEl.value || '').then(
      function () { setStatus('Copied', true); },
      function () { setStatus('Copy failed', false); }
    );
  });

  fillUnits();
  run();
})();
`;

export function unitConverterPage(cfg: AppConfig): string {
  return renderToolPage(cfg, {
    name: "unit-converter",
    title: "Unit Converter",
    intro:
      "Convert between length, weight, volume, temperature, area, speed and digital-data units. Type any value and see every equivalent unit at once. Everything runs locally in your browser — nothing is uploaded.",
    body: BODY,
    script: SCRIPT,
  });
}
