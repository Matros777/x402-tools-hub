/**
 * x402 Tools Hub — Time Toolkit page
 * Everything runs in the browser; the agent API lives at POST /api/time-toolkit.
 */

import type { AppConfig } from "../../config";
import { renderToolPage, type ToolPageOptions } from "../tool-page";

const BODY = `
<div class="studio">
  <div class="pane">
    <label class="lbl">Input (Unix seconds / milliseconds / ISO 8601 / RFC 2822 / free text)</label>
    <div class="row">
      <input id="ts-input" class="input" placeholder="1727000000 or 2026-09-22T20:00:00Z" value="1727000000">
      <select id="ts-unit" class="select">
        <option value="auto">auto</option>
        <option value="s">seconds</option>
        <option value="ms">milliseconds</option>
        <option value="iso">ISO / text</option>
      </select>
      <button class="btn btn-primary" id="btn-parse">Convert</button>
      <button class="btn" id="btn-now">Now</button>
    </div>
    <div class="row">
      <label class="chk"><input type="checkbox" id="opt-local" checked> show local time</label>
      <label class="chk"><input type="checkbox" id="opt-utc" checked> show UTC</label>
      <label class="chk"><input type="checkbox" id="opt-relative" checked> show relative</label>
    </div>
    <div id="ts-status" class="status"></div>
  </div>

  <div class="pane">
    <div class="pane-head">
      <span>Result</span>
      <button class="btn btn-ghost" id="btn-copy">Copy</button>
    </div>
    <div id="ts-out" class="out"></div>
  </div>

  <div class="pane">
    <div class="pane-head"><span>Time zones</span></div>
    <div class="row">
      <input id="tz-input" class="input" placeholder="Europe/Moscow, America/New_York, Asia/Tokyo" value="Europe/Moscow, America/New_York, Asia/Tokyo, UTC">
      <button class="btn" id="btn-tz">Show</button>
    </div>
    <div id="tz-out" class="out"></div>
  </div>

  <div class="pane">
    <div class="pane-head"><span>Duration / difference</span></div>
    <div class="row">
      <input id="dur-a" class="input" placeholder="2026-01-01T00:00:00Z" value="2026-01-01T00:00:00Z">
      <input id="dur-b" class="input" placeholder="2026-09-22T20:00:00Z" value="2026-09-22T20:00:00Z">
      <button class="btn" id="btn-dur">Diff</button>
    </div>
    <div id="dur-out" class="out"></div>
  </div>

  <div class="pane">
    <div class="pane-head"><span>Parser (free text)</span></div>
    <div class="row">
      <input id="nat-input" class="input" placeholder="in 3 days, 2 weeks ago, next monday 10:00">
      <button class="btn" id="btn-nat">Parse</button>
    </div>
    <div id="nat-out" class="out"></div>
  </div>
</div>
`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const pad = (n, w) => String(n).padStart(w || 2, "0");

  function status(msg, ok) {
    const el = $("ts-status");
    el.textContent = msg || "";
    el.className = "status " + (ok ? "ok" : "err");
  }

  function relative(d) {
    const diff = d.getTime() - Date.now();
    const abs = Math.abs(diff);
    const units = [
      [31536000000, "year"],
      [2592000000, "month"],
      [604800000, "week"],
      [86400000, "day"],
      [3600000, "hour"],
      [60000, "minute"],
      [1000, "second"],
    ];
    for (const [ms, name] of units) {
      if (abs >= ms || name === "second") {
        const n = Math.round(diff / ms);
        try {
          return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(n, name);
        } catch (e) {
          return (n >= 0 ? "in " : "") + Math.abs(n) + " " + name + (Math.abs(n) === 1 ? "" : "s") + (n < 0 ? " ago" : "");
        }
      }
    }
    return "";
  }

  function parseInput(raw, unit) {
    const s = String(raw || "").trim();
    if (!s) return { ok: false, error: "empty input" };
    if (unit === "s" || (unit === "auto" && /^-?\\d{1,11}(\\.\\d+)?$/.test(s))) {
      const n = Number(s);
      if (!isFinite(n)) return { ok: false, error: "not a number" };
      return { ok: true, date: new Date(n * 1000), source: "unix seconds" };
    }
    if (unit === "ms" || (unit === "auto" && /^-?\\d{12,}$/.test(s))) {
      const n = Number(s);
      if (!isFinite(n)) return { ok: false, error: "not a number" };
      return { ok: true, date: new Date(n), source: "unix milliseconds" };
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return { ok: false, error: "unrecognized date: " + s };
    return { ok: true, date: d, source: "parsed text" };
  }

  function render(date, source) {
    const t = date.getTime();
    const rows = [];
    rows.push(["source", source]);
    rows.push(["unix seconds", Math.floor(t / 1000)]);
    rows.push(["unix milliseconds", t]);
    rows.push(["ISO 8601 (UTC)", date.toISOString()]);
    if ($("opt-local").checked) rows.push(["local", date.toString()]);
    if ($("opt-utc").checked) rows.push(["UTC string", date.toUTCString()]);
    if ($("opt-relative").checked) rows.push(["relative", relative(date)]);
    rows.push(["RFC 2822 (UTC)", date.toUTCString().replace("GMT", "+0000")]);
    rows.push(["weekday", date.toLocaleDateString(undefined, { weekday: "long" })]);
    rows.push(["day of year", Math.floor((t - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000)]);
    $("ts-out").textContent = rows.map(([k, v]) => k + ": " + v).join("\\n");
  }

  $("btn-parse").onclick = () => {
    const r = parseInput($("ts-input").value, $("ts-unit").value);
    if (!r.ok) return status(r.error, false);
    render(r.date, r.source);
    status("ok", true);
  };

  $("btn-now").onclick = () => {
    const d = new Date();
    $("ts-input").value = String(Math.floor(d.getTime() / 1000));
    render(d, "now");
    status("now", true);
  };

  $("btn-copy").onclick = () => {
    navigator.clipboard.writeText($("ts-out").textContent);
    status("copied", true);
  };

  $("btn-tz").onclick = () => {
    const r = parseInput($("ts-input").value, $("ts-unit").value);
    if (!r.ok) return status(r.error, false);
    const zones = $("tz-input").value.split(",").map((z) => z.trim()).filter(Boolean);
    const lines = zones.map((z) => {
      try {
        const f = new Intl.DateTimeFormat("en-GB", {
          timeZone: z, dateStyle: "medium", timeStyle: "long", hour12: false,
        });
        return z + ": " + f.format(r.date);
      } catch (e) {
        return z + ": (unknown time zone)";
      }
    });
    $("tz-out").textContent = lines.join("\\n");
  };

  $("btn-dur").onclick = () => {
    const a = parseInput($("dur-a").value, "iso");
    const b = parseInput($("dur-b").value, "iso");
    if (!a.ok || !b.ok) return status("both sides must be valid dates", false);
    let ms = b.date.getTime() - a.date.getTime();
    const sign = ms < 0 ? -1 : 1;
    ms = Math.abs(ms);
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const total = [
      ["total milliseconds", ms],
      ["total seconds", Math.round(ms / 1000)],
      ["total minutes", Math.round(ms / 60000)],
      ["total hours", Math.round(ms / 3600000)],
      ["total days", Math.round(ms / 86400000)],
    ];
    $("dur-out").textContent =
      (sign < 0 ? "b is before a\\n" : "") +
      "human: " + days + "d " + hours + "h " + mins + "m " + secs + "s\\n" +
      total.map(([k, v]) => k + ": " + v).join("\\n");
  };

  $("btn-nat").onclick = () => {
    const s = $("nat-input").value.trim().toLowerCase();
    const now = new Date();
    let d = null;
    let m;
    if ((m = s.match(/^in\\s+(\\d+)\\s+(second|minute|hour|day|week|month|year)s?$/))) {
      const n = Number(m[1]);
      d = new Date(now.getTime());
      const map = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
      d = new Date(d.getTime() + n * map[m[2]]);
    } else if ((m = s.match(/^(\\d+)\\s+(second|minute|hour|day|week|month|year)s?\\s+ago$/))) {
      const n = Number(m[1]);
      const map = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
      d = new Date(now.getTime() - n * map[m[2]]);
    } else if ((m = s.match(/^(next|last)\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\\s+(\\d{1,2}):(\\d{2}))?$/))) {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const target = days.indexOf(m[2]);
      d = new Date(now.getTime());
      let delta = target - d.getDay();
      if (m[1] === "next") { delta = delta <= 0 ? delta + 7 : delta; }
      else { delta = delta >= 0 ? delta - 7 : delta; }
      d.setDate(d.getDate() + delta);
      if (m[3]) d.setHours(Number(m[3]), Number(m[4]), 0, 0);
      else d.setHours(0, 0, 0, 0);
    } else {
      const p = new Date(s);
      if (!isNaN(p.getTime())) d = p;
    }
    if (!d) { $("nat-out").textContent = "(cannot parse)"; return; }
    $("nat-out").textContent = [
      "iso: " + d.toISOString(),
      "unix: " + Math.floor(d.getTime() / 1000),
      "local: " + d.toString(),
      "relative: " + relative(d),
    ].join("\\n");
  };

  $("btn-parse").onclick();
  $("btn-tz").onclick();
  $("btn-dur").onclick();
})();
`;

export function timeToolkitPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "time-toolkit",
    title: "Time Toolkit",
    intro:
      "Convert between Unix timestamps, ISO 8601, RFC 2822 and human-readable dates, " +
      "inspect time zones, measure durations and parse natural-language dates — all in your browser. " +
      "The paid API endpoint for agents is at <code>POST /api/time-toolkit</code>.",
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
