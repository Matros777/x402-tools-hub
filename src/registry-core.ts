/**
 * x402 Tools Hub — Agent Registry core.
 *
 * A stateless, on-chain “registry” of agents/merchants. There is no
 * database: the registry is derived at request time from the wallets
 * you already know about (a seed list plus every counterparty we can
 * see for those seeds via their USDC receipts on Base).
 *
 * Given a set of seed addresses it:
 *   - pulls their incoming USDC receipts;
 *   - collects the distinct counterparties (paying agents/merchants);
 *   - scores each discovered wallet with the Trust Layer;
 *   - returns a ranked, deduplicated directory.
 *
 * This is intentionally bounded: the Worker only follows one hop from
 * the seeds, so the cost stays predictable. No writes, no storage.
 *
 * Used by:
 *   - GET  /tools/agent-registry              (free page)
 *   - POST /api/agent-registry/lookup         (free, for the page)
 *   - POST /api/agent-registry                (paid, for agents)
 */

import { getReceipts, getPassport, type TrustTier } from "./trust-core";

export const BASESCAN_ADDR = "https://basescan.org/address/";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RegistryEntry {
  address: string;
  score: number;
  tier: TrustTier;
  /** Where this address came from: "seed" or the seed that revealed it. */
  discovered_via: string;
  /** How many seeds/counterparties link to this wallet. */
  seen_as_counterparty_of: number;
  basescan: string;
}

export interface RegistryResult {
  seeds: string[];
  /** Distinct wallets discovered (excluding seeds themselves). */
  entries: RegistryEntry[];
  total_discovered: number;
  total_seeds: number;
  /** Hard cap applied while following counterparties. */
  per_seed_limit: number;
  generated_at: string;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a live directory of agents/merchants around the given seed
 * addresses. One hop only, bounded per seed, no storage.
 */
export async function getAgentRegistry(
  alchemyUrl: string,
  seeds: string[],
  perSeedLimit = 50,
): Promise<RegistryResult> {
  const notes: string[] = [];
  const cleanSeeds = uniq(seeds.filter(Boolean));
  if (cleanSeeds.length === 0) {
    notes.push("No seed addresses supplied — the registry is empty.");
  }

  const discovered = new Map<string, { via: Set<string>; count: number }>();

  for (const seed of cleanSeeds) {
    try {
      const result = await getReceipts(alchemyUrl, seed, "in", perSeedLimit);
      for (const r of result.receipts) {
        const cp = r.from;
        if (!cp || cp === seed) continue;
        const cur = discovered.get(cp);
        if (cur) {
          cur.via.add(seed);
          cur.count += 1;
        } else {
          discovered.set(cp, { via: new Set([seed]), count: 1 });
        }
      }
    } catch {
      notes.push(`Seed ${seed.slice(0, 10)}… could not be read; skipped.`);
    }
  }

  // Score each discovered wallet with the Trust Layer.
  const entries: RegistryEntry[] = [];
  for (const [address, meta] of discovered) {
    let score = 0;
    let tier: TrustTier = "new";
    try {
      const passport = await getPassport(alchemyUrl, address);
      score = passport.trust_score;
      tier = passport.tier;
    } catch {
      // Unscorable wallets still appear, at the bottom.
    }
    const viaList = Array.from(meta.via);
    entries.push({
      address,
      score,
      tier,
      discovered_via: viaList[0] ?? "",
      seen_as_counterparty_of: viaList.length,
      basescan: BASESCAN_ADDR + address,
    });
  }

  // Rank: trust score desc, then how many seeds link to it, then address.
  entries.sort((a, b) =>
    b.score - a.score ||
    b.seen_as_counterparty_of - a.seen_as_counterparty_of ||
    a.address.localeCompare(b.address),
  );

  if (entries.length === 0 && cleanSeeds.length > 0) {
    notes.push("No counterparties found for the supplied seeds.");
  }
  notes.push("Registry is one hop deep and built on demand — it is not stored anywhere.");

  return {
    seeds: cleanSeeds,
    entries: entries.slice(0, 200),
    total_discovered: entries.length,
    total_seeds: cleanSeeds.length,
    per_seed_limit: perSeedLimit,
    generated_at: new Date().toISOString(),
    notes,
  };
}
