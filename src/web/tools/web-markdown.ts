/**
 * Web Markdown — convert a web page (or pasted HTML) into Markdown.
 * Local conversion happens in the browser; optional URL fetch uses our API.
 */

import { renderToolPage, type ToolPageOptions } from "../tool-page";
import type { AppConfig } from "../../config";

const BODY = `
<div class="studio">
  <div class="studio-toolbar">
    <button id="btn-sample" class="btn">Sample HTML</button>
    <button id="btn-copy" class="btn">Copy Markdown</button>
    <button id="btn-download" class="btn">Download .md</button>
    <button id="btn-clear" class="btn btn-ghost">Clear</button>
  </div>

  <div class="query-row">
    <input id="url" class="input" placeholder="https://example.com/article">
    <button id="btn-fetch" class="btn">Fetch via API</button>
  </div>
  <div class="hint">Fetch by URL runs on the server and uses the paid x402 endpoint. Paste HTML below to convert fully offline.</div>

  <textarea id="html" class="editor" spellcheck="false"
    placeholder="Paste HTML here (View → Source, or copy the body) — or use Fetch via API above"></textarea>

  <div class="studio-toolbar">
    <button id="btn-convert" class="btn btn-primary">Convert to Markdown</button>
  </div>

  <div id="status" class="status"></div>

  <details class="pane" open>
    <summary>Markdown output</summary>
    <pre id="out" class="out"></pre>
  </details>
</div>`;

const SCRIPT = `
(function () {
  const $ = (id) => document.getElementById(id);
  const html = $("html"), out = $("out"), status = $("status");

  function setStatus(msg, ok) {
    status.textContent = msg;
    status.className = "status " + (ok ? "ok" : "err");
  }

  function decodeEntities(s) {
    return s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '\"')
      .replace(/&#39;/g, "'");
  }

  function htmlToMarkdown(src) {
    let s = src;
    // strip scripts, styles, comments, head
    s = s.replace(/<!--[\\s\\S]*?-->/g, "");
    s = s.replace(/<script[\\s\\S]*?<\\/script>/gi, "");
    s = s.replace(/<style[\\s\\S]*?<\\/style>/gi, "");
    s = s.replace(/<head[\\s\\S]*?<\\/head>/gi, "");

    // headings
    for (let i = 6; i >= 1; i--) {
      const re = new RegExp("<h" + i + "[^>]*>([\\s\\S]*?)<\\/h" + i + ">", "gi");
      s = s.replace(re, (_, inner) => "\\n" + "#".repeat(i) + " " + inner.trim() + "\\n");
    }

    // links and images
    s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi,
      (_, href, txt) => "[" + txt.replace(/<[^>]+>/g, "").trim() + "](" + href + ")");
    s = s.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi,
      (_, alt, src) => "![" + alt + "](" + src + ")");
    s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_, src) => "![](" + src + ")");

    // bold / italic / inline code
    s = s.replace(/<(strong|b)[^>]*>([\\s\\S]*?)<\\/(strong|b)>/gi, "**$2**");
    s = s.replace(/<(em|i)[^>]*>([\\s\\S]*?)<\\/(em|i)>/gi, "*$2*");
    s = s.replace(/<code[^>]*>([\\s\\S]*?)<\\/code>/gi, String.fromCharCode(96) + "$1" + String.fromCharCode(96));
    s = s.replace(/<pre[^>]*>([\\s\\S]*?)<\\/pre>/gi, "\\n" + String.fromCharCode(96).repeat(3) + "\\n$1\\n" + String.fromCharCode(96).repeat(3) + "\\n");

    // lists
    s = s.replace(/<li[^>]*>([\\s\\S]*?)<\\/li>/gi, "- $1\\n");
    s = s.replace(/<ul[^>]*>/gi, "\\n").replace(/<\\/ul>/gi, "\\n");
    s = s.replace(/<ol[^>]*>/gi, "\\n").replace(/<\\/ol>/gi, "\\n");

    // paragraphs and breaks
    s = s.replace(/<p[^>]*>([\\s\\S]*?)<\\/p>/gi, "$1\\n\\n");
    s = s.replace(/<br\\s*\\/?>/gi, "\\n");
    s = s.replace(/<hr\\s*\\/?>/gi, "\\n---\\n");

    // blockquote
    s = s.replace(/<blockquote[^>]*>([\\s\\S]*?)<\\/blockquote>/gi,
      (_, inner) => inner.trim().split("\\n").map((l) => "> " + l).join("\\n") + "\\n\\n");

    // strip remaining tags
    s = s.replace(/<[^>]+>/g, "");
    s = decodeEntities(s);

    // collapse excess whitespace
    s = s.replace(/\\n{3,}/g, "\\n\\n");
    s = s.split("\\n").map((l) => l.replace(/[ \\t]+$/g, "")).join("\\n");
    return s.trim();
  }

  function run() {
    const src = html.value;
    if (!src.trim()) return setStatus("Paste some HTML first", false);
    out.textContent = htmlToMarkdown(src);
    setStatus("Converted locally — nothing left your browser", true);
  }

  $("btn-convert").onclick = run;

  $("btn-sample").onclick = () => {
    html.value = '<h1>Hello</h1><p>This is <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</p><ul><li>One</li><li>Two</li></ul>';
    run();
  };

  $("btn-copy").onclick = () => {
    navigator.clipboard.writeText(out.textContent || "");
    setStatus("Markdown copied to clipboard", true);
  };

  $("btn-download").onclick = () => {
    const blob = new Blob([out.textContent || ""], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "page.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $("btn-clear").onclick = () => {
    html.value = "";
    out.textContent = "";
    setStatus("", true);
  };

  $("btn-fetch").onclick = async () => {
    const url = $("url").value.trim();
    if (!url) return setStatus("Enter a URL to fetch", false);
    setStatus("Fetching HTML from server…", true);
    try {
      const r = await fetch("/api/web-markdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (r.status === 402) {
        return setStatus("402 Payment Required — this endpoint is paid for API clients", false);
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setStatus("Server error: " + (j.error || r.status), false);
      if (j.markdown) {
        out.textContent = j.markdown;
        setStatus("Fetched and converted by server", true);
      } else {
        setStatus("Server returned no markdown", false);
      }
    } catch (e) {
      setStatus("Network error: " + e.message, false);
    }
  };
})();
`;

export function webMarkdownPage(cfg: AppConfig): string {
  const opts: ToolPageOptions = {
    name: "web-markdown",
    title: "Web Markdown",
    intro:
      "Turn any HTML into clean Markdown — locally in your browser. " +
      "You can also fetch a page through the server (paid x402 endpoint for agents). " +
      "The API is at <code>POST /api/web-markdown</code>.",
    howToUse: [
      "Paste HTML into the left pane, or fetch a page through the server.",
      "Click <strong>Convert</strong> to get clean Markdown.",
      "Tune options such as heading style or link format if needed.",
      "Copy the Markdown or download it as a file.",
    ],
    useCases: [
      "Turning documentation pages into Markdown for a knowledge base.",
      "Feeding web articles into an LLM pipeline.",
      "Cleaning pasted HTML before publishing.",
      "Agents converting pages via the paid <code>POST /api/web-markdown</code> endpoint.",
    ],
    body: BODY,
    script: SCRIPT,
  };
  return renderToolPage(cfg, opts);
}
