/**
 * x402 Tools Hub — Agent Route core.
 *
 * Agent Route Planner: the agent writes what it needs to do, and this
 * service picks the optimal sequence of x402 tools from the hub catalog.
 *
 * No LLM required: task-to-tool matching is a weighted keyword scorer
 * over TOOLS (name + description + tags). Budget-aware, availability-
 * aware, and it can surface trust info when the task mentions a wallet.
 *
 * Used by:
 *   - GET  /tools/agent-route          (free page)
 *   - POST /api/agent-route/lookup     (free, for the page)
 *   - POST /api/agent-route            (paid, for agents, $0.003)
 */

import { TOOLS, type AppConfig } from "./config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RouteInput {
  task?: string;
  budget_usdc?: number;
  max_steps?: number;
  chain?: string;
  mode?: "discover" | "plan" | "estimate" | "verify";
  wallet?: string;
}

export interface RouteStep {
  step: number;
  tool: string;
  reason: string;
  cost_usd: number;
  input_hint: string;
}

export interface RouteResult {
  mode: string;
  possible: boolean;
  steps: RouteStep[];
  estimated_cost_usd: number;
  budget_usdc: number | null;
  budget_remaining_usdc: number | null;
  matched: string[];
  trust: { score: number; tier: string } | null;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/*  Keyword → tool scoring                                             */
/* ------------------------------------------------------------------ */

interface KeywordRule {
  tool: string;
  keywords: string[];
  /** Short input hint shown for each step. */
  hint: string;
}

const RULES: KeywordRule[] = [
  { tool: "wallet-intel", keywords: ["wallet", "balance", "token", "portfolio", "eth", "usdc", "holding", "assets"], hint: "{address}" },
  { tool: "flight-recorder", keywords: ["receipt", "transfer", "history", "payment", "usdc", "transaction", "incoming", "outgoing"], hint: "{address, direction}" },
  { tool: "agent-passport", keywords: ["passport", "trust", "score", "reputation", "payer", "wallet", "counterparty", "trustworthy"], hint: "{address}" },
  { tool: "merchant-trust", keywords: ["merchant", "seller", "revenue", "reputation", "received", "payments", "vendor"], hint: "{address}" },
  { tool: "agent-registry", keywords: ["registry", "discover", "directory", "agent", "counterparties", "network", "ecosystem", "find", "who"], hint: "{seeds[]}" },
  { tool: "agent-studio", keywords: ["build", "create", "manifest", "generate", "agent", "configure", "scaffold"], hint: "{name, tools[], calls_per_month}" },
  { tool: "address-toolkit", keywords: ["address", "checksum", "eip-55", "eip55", "validate", "address format", "contract", "eoa"], hint: "{address}" },
  { tool: "base-gas", keywords: ["gas", "fee", "fees", "cost", "price", "transaction cost", "network fee"], hint: "{gas_limit?}" },
  { tool: "agent-intel", keywords: ["research", "analyze", "intel", "due diligence", "investigate", "research this", "website", "report", "assess"], hint: "{url?, seed?, address?}" },
  { tool: "web-markdown", keywords: ["markdown", "page", "content", "article", "url", "html", "read", "docs", "website", "blog"], hint: "{url}" },
  { tool: "url-metadata", keywords: ["metadata", "title", "og", "favicon", "open graph", "description tag"], hint: "{url}" },
  { tool: "token-counter", keywords: ["token", "count", "llm", "tokens", "context", "prompt", "chars"], hint: "{text}" },
  { tool: "json-studio", keywords: ["json", "format", "minify", "validate", "parse", "pretty"], hint: "{json}" },
  { tool: "jwt-inspector", keywords: ["jwt", "token", "decode", "verify", "claims", "auth", "bearer"], hint: "{token}" },
  { tool: "regex-mentor", keywords: ["regex", "pattern", "match", "regular expression", "extract"], hint: "{pattern, text}" },
  { tool: "encoder-hub", keywords: ["encode", "decode", "base64", "url encode", "hex", "binary", "html entity"], hint: "{codec, mode, value}" },
  { tool: "diff-pro", keywords: ["diff", "compare", "changes", "difference", "patch"], hint: "{a, b}" },
  { tool: "time-toolkit", keywords: ["time", "date", "unix", "timestamp", "convert", "timezone", "iso"], hint: "{input}" },
  { tool: "env-studio", keywords: ["env", "environment", "dotenv", ".env", "secrets"], hint: "{env}" },
  { tool: "hash-studio", keywords: ["hash", "md5", "sha", "digest", "checksum"], hint: "{text}" },
  { tool: "color-palette", keywords: ["color", "palette", "hex", "rgb", "contrast", "wcag"], hint: "{hex}" },
  { tool: "unit-converter", keywords: ["convert", "unit", "length", "weight", "volume", "temperature", "km", "miles"], hint: "{category, from, to, value}" },
  { tool: "git-explainer", keywords: ["git", "command", "error", "merge", "rebase", "commit", "branch"], hint: "{text}" },
  { tool: "meta-tags", keywords: ["seo", "meta", "og", "twitter card", "meta tags", "social preview"], hint: "{title, description, url}" },
  { tool: "x402-simulate", keywords: ["simulate", "cost", "budget", "estimate", "subscription", "break-even", "workload", "how much"], hint: "{calls[]}" },
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "is", "are",
  "this", "that", "i", "we", "you", "it", "do", "does", "need", "want", "find",
  "check", "get", "see", "look", "make", "give", "please", "can", "could", "what",
]);

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_+\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Score every tool against the task. Returns sorted [{tool, score, hint, reason}]. */
function scoreTools(task: string): Array<{ tool: string; score: number; hint: string; reason: string }> {
  const tokens = tokenize(task);
  const phrase = (task || "").toLowerCase();
  const scored: Array<{ tool: string; score: number; hint: string; reason: string }> = [];

  for (const rule of RULES) {
    let score = 0;
    const hits: string[] = [];
    for (const kw of rule.keywords) {
      if (tokens.includes(kw)) {
        score += kw.length; // longer keywords weigh more
        hits.push(kw);
      } else if (kw.includes(" ") && phrase.includes(kw)) {
        score += kw.length;
        hits.push(kw);
      }
    }
    // exact tool name mention gives a big boost
    if (tokens.includes(rule.tool)) score += 50;
    if (score > 0) {
      scored.push({
        tool: rule.tool,
        score,
        hint: rule.hint,
        reason: `Task mentions ${hits.join(", ")}`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export function routeTask(input: RouteInput): RouteResult {
  const notes: string[] = [];
  const task = (input.task || "").trim();
  const mode = input.mode ?? "plan";
  const budget = input.budget_usdc === undefined || input.budget_usdc === null
    ? null
    : Math.max(0, Number(input.budget_usdc) || 0);
  const maxSteps = Math.min(Math.max(Number(input.max_steps) || 3, 1), 8);
  const chain = input.chain || "base";

  if (!task) {
    notes.push("No task supplied — nothing to route.");
  }

  const scored = scoreTools(task);
  const matched = scored.map((s) => s.tool);

  const steps: RouteStep[] = scored.slice(0, maxSteps).map((s, i) => {
    const tool = TOOLS[s.tool];
    return {
      step: i + 1,
      tool: s.tool,
      reason: s.reason,
      cost_usd: tool ? tool.priceUsd : 0,
      input_hint: s.hint,
    };
  });

  const estimated = steps.reduce((sum, s) => sum + s.cost_usd, 0);

  // Trust info: if a wallet is explicitly given, note it as an available layer
  let trust: { score: number; tier: string } | null = null;
  if (input.wallet) {
    notes.push("Wallet supplied — pair with agent-passport/merchant-trust for trust before transacting.");
    trust = { score: 0, tier: "check-on-chain" };
  }

  // Budget feasibility
  let possible = true;
  if (budget !== null) {
    possible = estimated <= budget;
    if (!possible) notes.push(`Estimated cost $${estimated.toFixed(4)} exceeds budget $${budget.toFixed(4)}.`);
    else if (scored.length > maxSteps) notes.push(`More tools matched than max_steps (${maxSteps}) — only the top ${maxSteps} are in the plan.`);
  }

  if (scored.length === 0) {
    possible = false;
    notes.push("No hub tool matched the task — try rephrasing or check the catalog at /api/list.");
  }

  if (mode === "discover") {
    notes.push("Discover mode: returning top matches without a strict plan.");
  }

  return {
    mode,
    possible,
    steps,
    estimated_cost_usd: +estimated.toFixed(6),
    budget_usdc: budget,
    budget_remaining_usdc: budget === null ? null : +(budget - estimated).toFixed(6),
    matched,
    trust,
    notes,
  };
}