/**
 * x402 Tools Hub — generic tool page shell
 * Shared chrome (nav, sidebar, footer) + a content slot.
 */

import { TOOLS, type AppConfig } from "../config";

export interface ToolPageOptions {
  /** Tool slug, e.g. "json-studio" */
  name: string;
  /** Page <title> suffix, defaults to tool name */
  title?: string;
  /** Intro paragraph shown under the H1 */
  intro: string;
  /** Main content: form, textareas, preview panes... */
  body: string;
  /** Inline JS for client-side logic (runs fully in the browser) */
  script?: string;
}

/** All tools for the sidebar, sorted by name. */
function sidebarLinks(active: string): string {
  return Object.entries(TOOLS)
    .map(([name, t]) => {
      const cls = name === active ? " class=\"active\"" : "";
      return `<a href="/tools/${name}"${cls}><span class="s-icon">${t.icon}</span>${name}</a>`;
    })
    .join("");
}

export function renderToolPage(cfg: AppConfig, opts: ToolPageOptions): string {
  const tool = TOOLS[opts.name];
  const title = opts.title ?? opts.name;
  const price = tool ? tool.priceUsd : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${cfg.siteName}</title>
<meta name="description" content="${tool?.description ?? ""}">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>

<div class="bg-grid"></div>
<div class="bg-glow"></div>

<header class="nav">
  <div class="nav-inner">
    <a class="logo" href="/">
      <span class="logo-mark">◇</span>
      <span class="logo-text">${cfg.siteName}</span>
    </a>
    <nav class="nav-links">
      <a href="/#tools">Tools</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="/api/list">API</a>
    </nav>
  </div>
</header>

<main class="tool-layout">
  <aside class="tool-sidebar">
    <div class="sidebar-title">Tools</div>
    <nav class="sidebar-nav">
      ${sidebarLinks(opts.name)}
    </nav>
    <div class="sidebar-foot">
      <span class="tag tag-free">web: free</span>
      <span class="tag tag-paid">api: $${price} USDC</span>
    </div>
  </aside>

  <section class="tool-main">
    <div class="tool-head">
      <h1>${title}</h1>
      <div class="privacy-badge">100% in your browser · data never leaves your device</div>
    </div>
    <p class="tool-intro">${opts.intro}</p>
    ${opts.body}
  </section>
</main>

<footer class="footer">
  <div class="footer-inner">
    <span>${cfg.siteName}</span>
    <span class="footer-sep">·</span>
    <a href="/llms.txt">llms.txt</a>
    <span class="footer-sep">·</span>
    <a href="/openapi.json">openapi.json</a>
    <span class="footer-sep">·</span>
    <a href="/.well-known/agent.json">agent.json</a>
  </div>
  <div class="footer-copy">payments on ${cfg.network} · x402 protocol</div>
</footer>

${opts.script ? `<script>\n${opts.script}\n</script>` : ""}
</body>
</html>`;
}
