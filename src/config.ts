/**
 * x402 Tools Hub — central configuration
 * Cyber Jade palette, Cloudflare Workers + Hono
 */

export interface ToolPricing {
  /** Path to invoke the tool, e.g. /api/web-markdown */
  path: string;
  /** Human price in USD for the API call (agents) */
  priceUsd: number;
  /** Short description used in discovery files and landing */
  description: string;
  /** Icon glyph (unicode) for the landing card */
  icon: string;
  /** Whether the web form is free for humans */
  freeForHumans: boolean;
  /** Grouping on the landing page */
  category?: "web" | "data" | "crypto" | "time" | "text";
  /** Override the default /tools/{name} URL */
  webPath?: string;
}

/**
 * The catalog of tools exposed by the hub.
 * Keep this in sync with src/tools/index.ts handlers.
 */
export const TOOLS: Record<string, ToolPricing> = {
  "web-markdown": {
    path: "/api/web-markdown",
    priceUsd: 0.001,
    description: "Convert any public web page into clean, readable Markdown.",
    icon: "~",
    freeForHumans: true,
    category: "web",
  },
  "url-metadata": {
    path: "/api/url-metadata",
    priceUsd: 0.001,
    description: "Extract title, description, OpenGraph tags and favicon from a URL.",
    icon: "#",
    freeForHumans: true,
    category: "web",
  },
  "token-counter": {
    path: "/api/token-counter",
    priceUsd: 0.0005,
    description: "Count LLM tokens for a given text and model family.",
    icon: "T",
    freeForHumans: true,
    category: "text",
  },
  "json-studio": {
    path: "/api/json-studio",
    priceUsd: 0.001,
    description: "Format, minify, validate, query and diff JSON locally in the browser.",
    icon: "{",
    freeForHumans: true,
    category: "data",
  },
};

/** Payment + network configuration (values come from worker env vars). */
export interface AppConfig {
  network: string;
  facilitatorUrl: string;
  /** Receiving wallet address. NOT a secret, but never hardcoded here. */
  payTo: string | undefined;
  siteName: string;
  siteUrl: string;
}

/**
 * Reads configuration from the Worker environment.
 * Secrets (X402_PAY_TO) live in .dev.vars locally and via `wrangler secret put`.
 *
 * NOTE: there is intentionally NO fallback address. An unset X402_PAY_TO must
 * never silently settle to the zero address — the x402 middleware refuses to
 * start without it (see src/x402.ts).
 */
export function getConfig(env: Record<string, string | undefined>): AppConfig {
  return {
    network: env.X402_NETWORK ?? "base",
    facilitatorUrl: env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    payTo: env.X402_PAY_TO,
    siteName: env.SITE_NAME ?? "x402 Tools Hub",
    // Fallback: the platform's own deploy domain (Cloudflare workers.dev).
    // Env var SITE_URL (if set) always wins.
    siteUrl: env.SITE_URL ?? "https://x402-tools-hub.ivanbenks7-e96.workers.dev",
  };
}
