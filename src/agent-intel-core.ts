/**
 * x402 Tools Hub — Agent Intelligence Layer core.
 *
 * One pipeline over three existing capabilities:
 *   1. Web Markdown   → understand external content (URL)
 *   2. Agent Registry → discover agents/merchants around a seed wallet
 *   3. Agent Passport → trust-check a specific wallet
 *
 * The caller supplies one or more of { url, seed, address } and gets a
 * combined report. No database, no private keys; on-chain reads via
 * Alchemy, content via fetch.
 *
 * Used by:
 *   - GET  /tools/agent-intel          (free page)
 *   - POST /api/agent-intel/lookup     (free, for the page)
 *   - POST /api/agent-intel            (paid, for agents)
 */

import { getPassport, type PassportStats } from "./trust-core";
import { getAgentRegistry, type RegistryResult } from "./registry-core";
import { isValidEvmAddress, normalizeAddress } from "./wallet-intel-core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentIntelInput {
  url?: string;
  seed?: string;
  address?: string;
  per_seed?: number;
}

export interface WebMarkdownResult {
  url: string;
  title: string | null;
  chars: number;
  words: number;
  markdown: string;
  truncated: boolean;
}

export interface AgentIntelReport {
  content: WebMarkdownResult | null;
  registry: RegistryResult | null;
  passport: PassportStats | null;
  verdict: string;
  flags: string[];
  notes: string[];
}

/* ------------------------------------------------------------------ */
/*  Web Markdown helper (mirror of /api/web-markdown)                  */
/* ------------------------------------------------------------------ */

const MAX_MD_CHARS = 12_000;

async function fetchWebMarkdown(url: string): Promise<WebMarkdownResult> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} -> HTTP ${r.status}`);
  const html = await r.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? null;

  const md = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const truncated = md.length > MAX_MD_CHARS;
  const sliced = truncated ? md.slice(0, MAX_MD_CHARS) : md;
  return {
    url,
    title,
    chars: sliced.length,
    words: sliced.split(/\s+/).filter(Boolean).length,
    markdown: sliced,
    truncated,
  };
}

/* ------------------------------------------------------------------ */
/*  Verdict building                                                   */
/* ------------------------------------------------------------------ */

function buildVerdict(input: AgentIntelInput, report: AgentIntelReport): void {
  const flags: string[] = [];
  const notes: string[] = [];
  let verdict: string;

  const hasContent = report.content !== null;
  const hasRegistry = report.registry !== null;
  const hasPassport = report.passport !== null;

  if (!hasContent && !hasRegistry && !hasPassport) {
    verdict = "insufficient_input";
    notes.push("Supply at least one of: url, seed, address.");
  } else if (hasContent && hasRegistry && hasPassport) {
    verdict = "full_intel";
    notes.push("Content + discovery + trust — full picture assembled.");
  } else {
    verdict = "partial_intel";
    notes.push("Only some layers were requested; add url/seed/address for a full report.");
  }

  if (hasPassport) {
    const p = report.passport!;
    if (p.trust_score < 40) {
      flags.push(`Low trust score (${p.trust_score}/100, tier ${p.tier}) — proceed carefully.`);
    } else if (p.trust_score >= 60) {
      flags.push(`Good trust score (${p.trust_score}/100, tier ${p.tier}) — safe to interact.`);
    } else {
      flags.push(`Medium trust score (${p.trust_score}/100, tier ${p.tier}).`);
    }
  }

  if (hasRegistry) {
    const reg = report.registry!;
    if (reg.entries.length === 0) {
      notes.push("Registry found no counterparties for the seed.");
    } else {
      notes.push(`Registry discovered ${reg.entries.length} wallet(s) one hop from the seed.`);
    }
  }

  report.verdict = verdict;
  report.flags = flags;
  report.notes = notes;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function runAgentIntel(
  input: AgentIntelInput,
  alchemyUrl: string | undefined,
): Promise<AgentIntelReport> {
  const report: AgentIntelReport = {
    content: null,
    registry: null,
    passport: null,
    verdict: "",
    flags: [],
    notes: [],
  };

  // 1) Content
  if (input.url) {
    try {
      report.content = await fetchWebMarkdown(String(input.url).slice(0, 2000));
    } catch (e) {
      report.notes.push(`Content fetch failed: ${String((e as Error).message || e)}`);
    }
  }

  // 2) Registry
  if (input.seed && alchemyUrl && isValidEvmAddress(input.seed)) {
    try {
      const seed = normalizeAddress(input.seed);
      const perSeed = Math.min(Math.max(Number(input.per_seed) || 20, 1), 200);
      report.registry = await getAgentRegistry(alchemyUrl, [seed], perSeed);
    } catch (e) {
      report.notes.push(`Registry failed: ${String((e as Error).message || e)}`);
    }
  } else if (input.seed) {
    report.notes.push("Seed wallet address invalid — registry skipped.");
  }

  // 3) Passport
  if (input.address && alchemyUrl && isValidEvmAddress(input.address)) {
    try {
      const address = normalizeAddress(input.address);
      report.passport = await getPassport(alchemyUrl, address);
    } catch (e) {
      report.notes.push(`Passport failed: ${String((e as Error).message || e)}`);
    }
  } else if (input.address) {
    report.notes.push("Address invalid — passport skipped.");
  }

  buildVerdict(input, report);
  return report;
}