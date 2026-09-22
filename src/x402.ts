/**
 * x402 payment middleware factory for the Tools Hub.
 *
 * Wraps `paymentMiddleware` from x402-hono and builds the route table from
 * the tool catalog. The receiving address comes from the X402_PAY_TO secret
 * and is NEVER hardcoded in source or discovery files.
 */

import type { MiddlewareHandler } from "hono";
import { paymentMiddleware } from "x402-hono";
import type { RoutesConfig, Network } from "x402/types";
import { TOOLS, type AppConfig } from "./config";

/**
 * Builds the x402 route table: every paid tool path gets its own price.
 * `/api/list` is discovery-only and is intentionally absent — it stays open.
 */
function buildRoutes(cfg: AppConfig): RoutesConfig {
  const routes: Record<
    string,
    { price: string; network: Network; config: { description: string } }
  > = {};

  for (const tool of Object.values(TOOLS)) {
    routes[tool.path] = {
      price: `$${tool.priceUsd}`,
      network: cfg.network as Network,
      config: { description: tool.description },
    };
  }

  return routes;
}

/**
 * Returns a Hono middleware that enforces x402 payment on the paid tool API.
 *
 * @throws if X402_PAY_TO is not configured — fail-closed, never settle to zero.
 */
export function x402(cfg: AppConfig): MiddlewareHandler {
  if (!cfg.payTo) {
    throw new Error(
      "X402_PAY_TO is not configured. Set it via `wrangler secret put X402_PAY_TO` " +
        "(production) or in `.dev.vars` (local dev)."
    );
  }

  const routes = buildRoutes(cfg);

  return paymentMiddleware(
    cfg.payTo as `0x${string}`,
    routes,
    { url: cfg.facilitatorUrl as `${string}://${string}` }
  ) as unknown as MiddlewareHandler;
}
