/**
 * x402 Tools Hub — agent news core
 * Free public APIs, no keys required, Cloudflare Worker safe:
 *   - Hacker News search  (Algolia API: https://hn.algolia.com/api/v1)
 *   - Google News RSS     (https://news.google.com/rss/search?q=...)
 *
 * Powers three paid tools for agents:
 *   - hn-news     : fresh Hacker News stories/comments by keyword
 *   - x-search    : recent X/Twitter mentions + news by keyword
 *   - ai-incidents: news about AI agent incidents / failures / risks
 */

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  author?: string;
  points?: number;
  comments?: number;
  published?: string;
}

const HN_SEARCH = "https://hn.algolia.com/api/v1/search";
const GOOGLE_NEWS = "https://news.google.com/rss/search";

function clampInt(v: unknown, def: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

/** Strip HTML tags + collapse whitespace (for RSS descriptions). */
function cleanHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hacker News search via Algolia (stories by default). */
export async function fetchHnNews(
  query: string,
  opts: { limit?: number; tags?: string } = {}
): Promise<NewsItem[]> {
  const limit = clampInt(opts.limit, 8, 30);
  const tags = opts.tags ?? "story";
  const url =
    `${HN_SEARCH}?query=${encodeURIComponent(query)}` +
    `&tags=${encodeURIComponent(tags)}&hitsPerPage=${limit}&numericFilters=points%3E=3`;
  const r = await fetch(url, { headers: { "user-agent": "x402-tools-hub/1.0" } });
  if (!r.ok) throw new Error(`hn_search_${r.status}`);
  const j = (await r.json()) as { hits?: Array<Record<string, unknown>> };
  if (!Array.isArray(j.hits)) return [];
  return j.hits
    .filter((h) => typeof h.title === "string")
    .map((h) => ({
      title: String(h.title),
      url:
        typeof h.url === "string" && h.url
          ? h.url
          : `https://news.ycombinator.com/item?id=${String(h.objectID ?? "")}`,
      source: "Hacker News",
      author: typeof h.author === "string" ? h.author : undefined,
      points: typeof h.points === "number" ? h.points : undefined,
      comments: typeof h.num_comments === "number" ? h.num_comments : undefined,
      published: typeof h.created_at === "string" ? h.created_at : undefined,
    }));
}

/** Google News RSS search — returns recent articles. */
export async function fetchGoogleNews(
  query: string,
  opts: { limit?: number; lang?: string; country?: string } = {}
): Promise<NewsItem[]> {
  const limit = clampInt(opts.limit, 8, 20);
  const lang = opts.lang ?? "en-US";
  const country = opts.country ?? "US";
  const url =
    `${GOOGLE_NEWS}?q=${encodeURIComponent(query)}` +
    `&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country)}&ceid=${encodeURIComponent(country + ":" + lang.split("-")[0])}`;
  const r = await fetch(url, { headers: { "user-agent": "x402-tools-hub/1.0" } });
  if (!r.ok) throw new Error(`gnews_${r.status}`);
  const xml = await r.text();

  // Minimal, robust RSS item parser (no external deps in the worker).
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1] ?? "";
    const pick = (tag: string): string => {
      const t = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
      return t ? cleanHtml(t[1] ?? "") : "";
    };
    const title = pick("title");
    if (!title) continue;
    const linkRaw = pick("link");
    const sourceRaw = pick("source");
    const dateRaw = pick("pubDate");
    items.push({
      title,
      url: linkRaw,
      source: sourceRaw || "News",
      published: dateRaw || undefined,
    });
  }
  return items;
}

/** AI agent incident feed: HN + Google News on risky agent topics. */
export async function fetchAiIncidents(
  opts: { limit?: number } = {}
): Promise<NewsItem[]> {
  const limit = clampInt(opts.limit, 10, 30);
  const half = Math.ceil(limit / 2);

  const queries = [
    '"AI agent" incident',
    '"AI agent" failure OR bug OR hack OR vulnerability',
    "autonomous agent attack OR exploit",
    '"AI agent" hallucination OR jailbreak OR leak',
  ];
  const q = queries[Math.floor(Math.random() * queries.length)] ?? '"AI agent" incident';

  const [hn, news] = await Promise.all([
    fetchHnNews(q, { limit: half, tags: "story" }).catch(() => []),
    fetchGoogleNews(q, { limit: half }).catch(() => []),
  ]);

  // Dedupe by title (lowercased).
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of [...hn, ...news]) {
    const key = item.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}