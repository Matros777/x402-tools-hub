/**
 * x402 Tools Hub — generic tool page shell
 * Shared chrome (nav, sidebar grouped by category, search, footer) + a content slot.
 */

import {
  TOOLS,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type AppConfig,
  type ToolCategory,
} from "../config";

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
  /** "How to use" steps rendered as an ordered list under the tool */
  howToUse?: string[];
  /** "Where it applies" bullet points rendered under the tool */
  useCases?: string[];
}

interface SidebarEntry {
  name: string;
  icon: string;
  category: ToolCategory;
}

/** Build a flat, category-aware list of every tool. */
function collectEntries(): SidebarEntry[] {
  const list: SidebarEntry[] = [];
  for (const [name, t] of Object.entries(TOOLS)) {
    list.push({
      name,
      icon: t.icon,
      // Tools without an explicit category fall into "data" as a sensible default.
      category: t.category ?? "data",
    });
  }
  return list;
}

/**
 * Sidebar markup: a search box on top, then one <div class="sidebar-group">
 * per non-empty category, ordered per CATEGORY_ORDER.
 * Each entry carries data-name for client-side filtering.
 */
function sidebarMarkup(active: string): string {
  const entries = collectEntries();
  const byCategory = new Map<ToolCategory, SidebarEntry[]>();

  for (const entry of entries) {
    const bucket = byCategory.get(entry.category);
    if (bucket) bucket.push(entry);
    else byCategory.set(entry.category, [entry]);
  }

  const groups: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const bucket = byCategory.get(cat);
    if (!bucket || bucket.length === 0) continue;

    bucket.sort((a, b) => a.name.localeCompare(b.name));

    const links = bucket
      .map((e) => {
        const cls = e.name === active ? " class=\"active\"" : "";
        return (
          `<a href="/tools/${e.name}"${cls} data-name="${e.name}">` +
          `<span class="s-icon">${e.icon}</span>${e.name}</a>`
        );
      })
      .join("");

    groups.push(
      `<div class="sidebar-group" data-category="${cat}">` +
        `<div class="sidebar-group-title">${CATEGORY_LABELS[cat]}</div>` +
        links +
        `</div>`
    );
  }

  return (
    `<div class="sidebar-search">` +
    `<input id="tool-search" type="search" placeholder="Search tools…" autocomplete="off" spellcheck="false">` +
    `</div>` +
    `<div id="sidebar-empty" class="sidebar-empty" hidden>No matches</div>` +
    groups.join("")
  );
}

/** Tiny client-side script: filter sidebar links by substring, hide empty groups. */
function sidebarScript(): string {
  return `
(function () {
  var input = document.getElementById('tool-search');
  if (!input) return;
  var groups = Array.prototype.slice.call(document.querySelectorAll('.sidebar-group'));
  var empty = document.getElementById('sidebar-empty');
  function apply() {
    var q = (input.value || '').trim().toLowerCase();
    var anyVisible = false;
    groups.forEach(function (g) {
      var links = Array.prototype.slice.call(g.querySelectorAll('a[data-name]'));
      var groupVisible = false;
      links.forEach(function (a) {
        var name = (a.getAttribute('data-name') || '').toLowerCase();
        var hit = !q || name.indexOf(q) !== -1;
        a.style.display = hit ? '' : 'none';
        if (hit) groupVisible = true;
      });
      g.style.display = groupVisible ? '' : 'none';
      if (groupVisible) anyVisible = true;
    });
    if (empty) empty.hidden = anyVisible;
  }
  input.addEventListener('input', apply);
  apply();
})();
`;
}

/**
 * Bottom-of-page guidance: "How to use" (ordered steps) and "Where it applies"
 * (bullet list). Rendered only when the corresponding option is provided, so
 * tools can opt in incrementally without touching the shared shell.
 */
function guideMarkup(opts: ToolPageOptions): string {
  const steps = opts.howToUse ?? [];
  const cases = opts.useCases ?? [];
  if (steps.length === 0 && cases.length === 0) return "";

  const blocks: string[] = [];
  if (steps.length > 0) {
    const items = steps.map((s) => `<li>${s}</li>`).join("");
    blocks.push(
      `<div class="guide-block">` +
        `<h2 class="guide-title">How to use</h2>` +
        `<ol class="guide-steps">${items}</ol>` +
        `</div>`
    );
  }
  if (cases.length > 0) {
    const items = cases.map((s) => `<li>${s}</li>`).join("");
    blocks.push(
      `<div class="guide-block">` +
        `<h2 class="guide-title">Where it applies</h2>` +
        `<ul class="guide-cases">${items}</ul>` +
        `</div>`
    );
  }

  return `<section class="tool-guide">${blocks.join("")}</section>`;
}

export function renderToolPage(cfg: AppConfig, opts: ToolPageOptions): string {
  const tool = TOOLS[opts.name];
  const title = opts.title ?? opts.name;
  const price = tool ? tool.priceUsd : 0;
  const description = tool?.description ?? "";

  const bodyScript = opts.script ?? "";
  const combinedScript = sidebarScript() + (bodyScript ? "\n" + bodyScript : "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${cfg.siteName}</title>
<meta name="description" content="${description}">
<meta name="keywords" content="${opts.name}, x402, paid API, AI agents, ${cfg.network}, developer tool">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${cfg.siteUrl}/tools/${opts.name}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${cfg.siteName}">
<meta property="og:title" content="${title} — ${cfg.siteName}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${cfg.siteUrl}/tools/${opts.name}">
<meta property="og:image" content="${cfg.siteUrl}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title} — ${cfg.siteName}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${cfg.siteUrl}/og.png">
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
      ${sidebarMarkup(opts.name)}
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
    ${guideMarkup(opts)}
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

<script>
${combinedScript}
</script>
</body>
</html>`;
}
