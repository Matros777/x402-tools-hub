/**
 * URL Metadata — extract title, description, OpenGraph tags and favicon.
 * Local parsing of pasted HTML; optional URL fetch uses our API.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="studio-toolbar">
    <button id="btn-sample" class="btn">Sample HTML</button>
    <button id="btn-copy" class="btn">Copy JSON</button>
    <button id="btn-download" class="btn">Download .json</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <div class="query-row">
    <input id="url" class="input" placeholder="https://example.com/article">
    <button id="btn-fetch" class="btn">Fetch via API</button>
  </div>
  <div class="hint">Fetch by URL runs on the server and uses the paid x402 endpoint. Paste HTML below to parse fully offline.</div>

  <textarea id="html" class="editor" spellcheck="false"
    placeholder="Paste HTML here (View → Source) — or use Fetch via API above"></textarea>

  <div class="studio-toolbar">
    <button id="btn-parse" class="btn btn-primary">Parse Metadata</button>
  </div>

  <div id="status" class="status"></div>

  <div id="preview" class="preview" hidden></div>

  <details class="pane" open>
    <summary>Extracted metadata</summary>
    <div id="kv" class="kv"></div>
  </details>

  <details class="pane">
    <summary>OpenGraph / Twitter tags</summary>
    <pre id="og" class="out"></pre>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const html = $("html"), status = $("status");

  function setStatus(msg, ok) {
    status.textContent = msg;
    status.className = "status " + (ok ? "ok" : "err");
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function metaMap(src) {
    const map = {};
    const re = /<meta\\b[^>]*>/gi;
    let m;
    while ((m = re.exec(src))) {
      const tag = m[0];
      const name = (/\\bname\\s*=\\s*["']([^"']+)["']/i.exec(tag) || [])[1];
      const prop = (/\\bproperty\\s*=\\s*["']([^"']+)["']/i.exec(tag) || [])[1];
      const content = (/\\bcontent\\s*=\\s*["']([^"']*)["']/i.exec(tag) || [])[1];
      const key = (name || prop || "").toLowerCase();
      if (key && content !== undefined) map[key] = decodeEntities(content);
    }
    return map;
  }

  function parseHtml(src) {
    const title = decodeEntities((/<title[^>]*>([\\s\\S]*?)<\\/title>/i.exec(src) || [])[1] || "").trim() || null;
    const meta = metaMap(src);
    const description = meta["description"] || meta["og:description"] || meta["twitter:description"] || null;
    const og = {};
    for (const k of Object.keys(meta)) {
      if (k.startsWith("og:") || k.startsWith("twitter:")) og[k] = meta[k];
    }

    let favicon = null;
    const linkRe = /<link\\b[^>]*>/gi;
    let lm;
    while ((lm = linkRe.exec(src))) {
      const tag = lm[0];
      const rel = (/\\brel\\s*=\\s*["']([^"']+)["']/i.exec(tag) || [])[1];
      const href = (/\\bhref\\s*=\\s*["']([^"']+)["']/i.exec(tag) || [])[1];
      if (rel && href && /icon/i.test(rel)) { favicon = href; break; }
    }

    const lang = (/<html\\b[^>]*\\blang\\s*=\\s*["']([^"']+)["']/i.exec(src) || [])[1] || null;
    const canonical = (/<link\\b[^>]*\\brel\\s*=\\s*["']canonical["'][^>]*>/i.exec(src) || [])[0];
    const canonicalHref = canonical ? (/\\bhref\\s*=\\s*["']([^"']+)["']/i.exec(canonical) || [])[1] || null : null;

    return {
      title,
      description,
      lang,
      favicon,
      canonical: canonicalHref,
      og,
    };
  }

  function render(data) {
    const rows = [
      ["Title", data.title],
      ["Description", data.description],
      ["Language", data.lang],
      ["Canonical", data.canonical],
      ["Favicon", data.favicon],
      ["OG tags found", Object.keys(data.og).length],
    ];
    $("kv").innerHTML = rows.map((r) =>
      '<div class="kv-row"><span class="kv-k">' + r[0] + '</span>' +
      '<span class="kv-v">' + (r[1] === null || r[1] === undefined || r[1] === "" ? '<span class="muted">—</span>' : escapeHtml(String(r[1]))) + '</span></div>'
    ).join("");

    $("og").textContent = Object.keys(data.og).length
      ? Object.entries(data.og).map(([k, v]) => k + ": " + v).join("\\n")
      : "(none)";

    const p = $("preview");
    if (data.title || data.description || data.favicon) {
      p.hidden = false;
      p.innerHTML =
        (data.favicon ? '<img class="preview-icon" src="' + escapeAttr(data.favicon) + '" alt="" onerror="this.style.display=&#39;none&#39;">' : '') +
        '<div class="preview-body">' +
        '<div class="preview-title">' + escapeHtml(data.title || "(no title)") + '</div>' +
        '<div class="preview-desc">' + escapeHtml(data.description || "") + '</div>' +
        '</div>';
    } else {
      p.hidden = true;
      p.innerHTML = "";
    }
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function run(src) {
    if (!src.trim()) return setStatus("Paste some HTML first", false);
    const data = parseHtml(src);
    render(data);
    setStatus("Parsed locally — nothing left your browser", true);
    return data;
  }

  $("btn-parse").onclick = () => run(html.value);

  $("btn-sample").onclick = () => {
    html.value = '<!doctype html><html lang="en"><head><title>Example Article</title><meta name="description" content="A short description of the page."><meta property="og:title" content="Example Article"><meta property="og:type" content="article"><link rel="icon" href="/favicon.ico"><link rel="canonical" href="https://example.com/article"></head><body>Hello</body></html>';
    run(html.value);
  };

  $("btn-copy").onclick = () => {
    const data = run(html.value);
    if (data) {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setStatus("Metadata JSON copied to clipboard", true);
    }
  };

  $("btn-download").onclick = () => {
    const data = run(html.value);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "metadata.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $("btn-clear").onclick = () => {
    html.value = "";
    $("kv").innerHTML = "";
    $("og").textContent = "";
    $("preview").hidden = true;
    setStatus("", true);
  };

  $("btn-fetch").onclick = async () => {
    const url = $("url").value.trim();
    if (!url) return setStatus("Enter a URL to fetch", false);
    setStatus("Fetching HTML from server…", true);
    try {
      const r = await fetch("/api/url-metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (r.status === 402) {
        return setStatus("402 Payment Required — this endpoint is paid for API clients", false);
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setStatus("Server error: " + (j.error || r.status), false);
      render({
        title: j.title ?? null,
        description: j.description ?? null,
        lang: null,
        favicon: j.favicon ?? null,
        canonical: null,
        og: j.openGraph || {},
      });
      setStatus("Metadata fetched by server", true);
    } catch (e) {
      setStatus("Network error: " + e.message, false);
    }
  };
})();
`;

export function urlMetadataPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "url-metadata",
    title: "URL Metadata",
    intro:
      "Extract title, description, OpenGraph tags and favicon from HTML — locally in your browser. " +
      "You can also fetch a page through the server (paid x402 endpoint for agents). " +
      "The API is at <code>POST /api/url-metadata</code>.",
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
