/**
 * x402 Tools Hub — central configuration
 * Cyber Jade palette, Cloudflare Workers + Hono
 *
 * 100+ tools roadmap: see PLAN-100-TOOLS.md at the repo root.
 */

/**
 * Tool categories, ordered exactly as they render in the sidebar and landing.
 * Keep CATEGORY_ORDER and ToolCategory in sync.
 *
 * "trust" is deliberately first: the Trust Layer (Flight Recorder + Agent
 * Passport) is the hub's flagship feature and anchors the landing page.
 */
export const CATEGORY_ORDER = [
  "trust",
  "data",
  "text",
  "encode",
  "crypto",
  "web",
  "regex",
  "time",
  "color",
  "convert",
  "devops",
  "git",
  "ai",
  "security",
  "seo",
] as const;

export type ToolCategory = (typeof CATEGORY_ORDER)[number];

/** Human-readable labels for the sidebar / landing sections. */
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  trust: "Trust Layer",
  data: "Data",
  text: "Text",
  encode: "Encode / Decode",
  crypto: "Crypto",
  web: "Web / HTTP",
  regex: "Regex",
  time: "Time",
  color: "Color / Design",
  convert: "Converters",
  devops: "DevOps",
  git: "Git",
  ai: "AI / LLM",
  security: "Security",
  seo: "SEO / Meta",
};

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
  /** Grouping on the landing page and sidebar */
  category?: ToolCategory;
  /** Override the default /tools/{name} URL */
  webPath?: string;
}

/**
 * The catalog of tools exposed by the hub.
 * Keep this in sync with src/tools/index.ts handlers.
 */
export const TOOLS: Record<string, ToolPricing> = {
  /* ---------------- Trust Layer ---------------- */
  "flight-recorder": {
    path: "/api/flight-recorder",
    priceUsd: 0.001,
    description: "The black box for x402: inspect every USDC receipt an address got on Base.",
    icon: "▶",
    freeForHumans: true,
    category: "trust",
  },
  "agent-passport": {
    path: "/api/agent-passport",
    priceUsd: 0.001,
    description: "Reputation passport for x402 payer wallets: a 0-100 Trust Score from on-chain history.",
    icon: "☰",
    freeForHumans: true,
    category: "trust",
  },
  "x402-simulate": {
    path: "/api/x402-simulate",
    priceUsd: 0.001,
    description: "Cost modeller for x402 workloads: effective price per call, network overhead and break-even.",
    icon: "∑",
    freeForHumans: true,
    category: "trust",
  },
  "merchant-trust": {
    path: "/api/merchant-trust",
    priceUsd: 0.001,
    description: "Reputation for a receiving wallet: volume, distinct payers, frequency and concentration risk.",
    icon: "◈",
    freeForHumans: true,
    category: "trust",
  },
  "agent-registry": {
    path: "/api/agent-registry",
    priceUsd: 0.001,
    description: "Live, stateless directory of agents and merchants built one hop from seed wallets on Base.",
    icon: "⛓",
    freeForHumans: true,
    category: "trust",
  },

  "agent-studio": {
    path: "/api/agent-studio",
    priceUsd: 0.002,
    description: "Build an x402 agent from a short description: manifest, capability check and a dry-run cost model.",
    icon: "⚒",
    freeForHumans: true,
    category: "trust",
  },

  /* ---------------- Core ---------------- */
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
    category: "ai",
  },
  "json-studio": {
    path: "/api/json-studio",
    priceUsd: 0.001,
    description: "Format, minify, validate, query and diff JSON locally in the browser.",
    icon: "{",
    freeForHumans: true,
    category: "data",
  },
  "jwt-inspector": {
    path: "/api/jwt-inspector",
    priceUsd: 0.001,
    description: "Decode, audit, verify and diff JSON Web Tokens locally in the browser.",
    icon: "J",
    freeForHumans: true,
    category: "security",
  },
  "regex-mentor": {
    path: "/api/regex-mentor",
    priceUsd: 0.001,
    description: "Test, debug and explain regular expressions with highlighted matches.",
    icon: "/",
    freeForHumans: true,
    category: "regex",
  },
  "encoder-hub": {
    path: "/api/encoder-hub",
    priceUsd: 0.0005,
    description: "Base64, URL, HTML entities, hex, binary and JWT segment encode/decode.",
    icon: "&",
    freeForHumans: true,
    category: "encode",
  },
  "diff-pro": {
    path: "/api/diff-pro",
    priceUsd: 0.0005,
    description: "Line-level text diff with unified and side-by-side views.",
    icon: "±",
    freeForHumans: true,
    category: "text",
  },
  "time-toolkit": {
    path: "/api/time-toolkit",
    priceUsd: 0.0005,
    description: "Convert Unix, ISO, RFC 2822 and natural-language dates; time zones and durations.",
    icon: "◷",
    freeForHumans: true,
    category: "time",
  },
  "env-studio": {
    path: "/api/env-studio",
    priceUsd: 0.001,
    description: "Parse .env files, mask secrets and convert to JSON, YAML, docker-compose or shell.",
    icon: "=",
    freeForHumans: true,
    category: "data",
  },
  "hash-studio": {
    path: "/api/hash-studio",
    priceUsd: 0.0005,
    description: "Compute MD5, SHA-1, SHA-256, SHA-384 and SHA-512 hashes locally.",
    icon: "#",
    freeForHumans: true,
    category: "crypto",
  },
  "color-palette": {
    path: "/api/color-palette",
    priceUsd: 0.0005,
    description: "Palette generator with HEX/RGB/HSL, WCAG contrast and CSS/Tailwind export.",
    icon: "◆",
    freeForHumans: true,
    category: "color",
  },
  "unit-converter": {
    path: "/api/unit-converter",
    priceUsd: 0.0005,
    description: "Convert length, weight, volume, temperature, area, speed and data units.",
    icon: "⇄",
    freeForHumans: true,
    category: "convert",
  },
  "git-explainer": {
    path: "/api/git-explainer",
    priceUsd: 0.0005,
    description: "Plain-English explanations for git commands and error messages.",
    icon: "⑂",
    freeForHumans: true,
    category: "git",
  },
  "meta-tags": {
    path: "/api/meta-tags",
    priceUsd: 0.0005,
    description: "Generate SEO, OpenGraph and Twitter Card meta tags with live preview.",
    icon: "⊕",
    freeForHumans: true,
    category: "seo",
  },
  "wallet-intel": {
    path: "/api/wallet-intel",
    priceUsd: 0.001,
    description: "Base wallet snapshot: ETH balance, top ERC-20 tokens, transfer history and a heuristic risk score.",
    icon: "◎",
    freeForHumans: true,
    category: "crypto",
  },

  "agent-intel": {
    path: "/api/agent-intel",
    priceUsd: 0.002,
    description: "Agent Intelligence: read a page as Markdown, discover counterparties and trust-score a wallet in one pipeline.",
    icon: "⚓",
    freeForHumans: true,
    category: "trust",
  },

  "agent-route": {
    path: "/api/agent-route",
    priceUsd: 0.003,
    description: "Agent Route: plan the optimal sequence of hub tools for a task, with budget check.",
    icon: "⟳",
    freeForHumans: true,
    category: "trust",
  },

  "402-probe": {
    path: "/api/402-probe",
    priceUsd: 0.002,
    description: "Probe any URL: is it a live x402 endpoint, and what are its exact payment terms?",
    icon: "⚙",
    freeForHumans: true,
    category: "trust",
  },

  "well-known": {
    path: "/api/well-known",
    priceUsd: 0.001,
    description: "Read the discovery surface of any origin: well-known/x402, openapi, agent.json, llms.txt, robots.txt.",
    icon: "◉",
    freeForHumans: true,
    category: "trust",
  },

  "agent-health": {
    path: "/api/agent-health",
    priceUsd: 0.003,
    description: "Agent Health: cosmic diagnostics — payment readiness + discovery + latency in one scan.",
    icon: "✹",
    freeForHumans: true,
    category: "trust",
  },

  "address-toolkit": {
    path: "/api/address-toolkit",
    priceUsd: 0.001,
    description: "Validate, EIP-55 checksum and classify any EVM address (EOA vs contract).",
    icon: "⏻",
    freeForHumans: true,
    category: "crypto",
  },
  "base-gas": {
    path: "/api/base-gas",
    priceUsd: 0.001,
    description: "Live Base gas price and transaction cost estimate in USD.",
    icon: "⚡",
    freeForHumans: true,
    category: "crypto",
  },

  "payment-decoder": {
    path: "/api/payment-decoder",
    priceUsd: 0.001,
    description: "Decode a raw PAYMENT-REQUIRED header or 402 body into structured payment fields.",
    icon: "☴",
    freeForHumans: true,
    category: "trust",
  },

  "receipt-notary": {
    path: "/api/receipt-notary",
    priceUsd: 0.001,
    description: "Notarize a paid response: SHA-256 + timestamp + resource + tx into a compact receipt.",
    icon: "❀",
    freeForHumans: true,
    category: "trust",
  },

  "token-inspector": {
    path: "/api/token-inspector",
    priceUsd: 0.001,
    description: "Fact-only token identity for Base: contract vs EOA, ERC-20 vs ERC-721, name, symbol, decimals, total supply and owner.",
    icon: "🔎",
    freeForHumans: true,
    category: "crypto",
  },

  "token-quote": {
    path: "/api/token-quote",
    priceUsd: 0.001,
    description: "Fact-only token quote: price, 24h change, source and timestamp. No advice, no history.",
    icon: "¥",
    freeForHumans: true,
    category: "crypto",
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
  /** Alchemy Base mainnet JSON-RPC URL (secret; wallet-intel + trust layer). */
  alchemyBaseUrl: string | undefined;
}

/**
 * Reads configuration from the Worker environment.
 * Secrets (X402_PAY_TO, ALCHEMY_BASE_URL) live in .dev.vars locally and via
 * `wrangler secret put`.
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
    alchemyBaseUrl: env.ALCHEMY_BASE_URL,
  };
}
