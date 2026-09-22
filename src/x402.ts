/**
 * x402 v2 payment middleware for the Tools Hub.
 * Совместим с awal/oval CLI. Собственная реализация вместо x402-hono (v1).
 */
import type { MiddlewareHandler } from "hono";
import { TOOLS, type AppConfig } from "./config";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK_EIP155 = "eip155:8453";
const MAX_TIMEOUT = 300;

function usdToAtomic(priceUsd: number): string {
  // USDC 6 decimals
  return Math.round(priceUsd * 1_000_000).toString();
}

/** Строим accepts[] для одного инструмента. */
function buildAccepts(cfg: AppConfig, priceUsd: number) {
  return {
    scheme: "exact",
    network: NETWORK_EIP155,
    amount: usdToAtomic(priceUsd),
    asset: USDC_BASE,
    payTo: cfg.payTo!,
    maxTimeoutSeconds: MAX_TIMEOUT,
    extra: { name: "USD Coin", version: "2" },
  };
}

/** Конфиг для обычных v2-клиентов (resource — объект). */
function buildPaymentConfig(cfg: AppConfig, resourceUrl: string, desc: string, priceUsd: number) {
  return {
    x402Version: 2,
    resource: { url: resourceUrl, description: desc, mimeType: "application/json" },
    accepts: [buildAccepts(cfg, priceUsd)],
  };
}

/** Конфиг для awal/oval (resource — строкой + domain). */
function buildPaymentConfigOval(cfg: AppConfig, resourceUrl: string, desc: string, priceUsd: number) {
  const acc = buildAccepts(cfg, priceUsd);
  return {
    x402Version: 2,
    resource: resourceUrl,
    description: desc,
    mimeType: "application/json",
    accepts: [{
      scheme: acc.scheme,
      network: acc.network,
      amount: acc.amount,
      asset: acc.asset,
      payTo: acc.payTo,
      maxTimeoutSeconds: acc.maxTimeoutSeconds,
    }],
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 8453,
      verifyingContract: USDC_BASE,
    },
  };
}

function b64(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(s: string): any {
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function verifyAndSettle(facilitatorUrl: string, paymentHeader: string, requirements: any): Promise<boolean> {
  let paymentData: any;
  try {
    paymentData = b64decode(paymentHeader);
  } catch {
    return false;
  }
  try {
    const v = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload: paymentData, paymentRequirements: requirements }),
    });
    if (!v.ok) return false;
    const vd: any = await v.json();
    if (!vd.isValid) return false;

    const s = await fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload: paymentData, paymentRequirements: requirements }),
    });
    return s.ok;
  } catch {
    return false;
  }
}

/**
 * x402 v2 middleware. Регистрируется на /api/* (paid routes).
 * Определяет инструмент по пути, отдаёт 402 с PAYMENT-REQUIRED,
 * проверяет платёж через facilitator, пропускает дальше.
 */
export function x402v2(cfg: AppConfig): MiddlewareHandler {
  if (!cfg.payTo) {
    throw new Error("X402_PAY_TO не задан. Установите `wrangler secret put X402_PAY_TO`.");
  }

  const byPath = new Map<string, { desc: string; priceUsd: number }>();
  for (const t of Object.values(TOOLS)) {
    byPath.set(t.path, { desc: t.description, priceUsd: t.priceUsd });
  }

  return async (c, next) => {
    const path = new URL(c.req.url).pathname;
    const tool = byPath.get(path);
    if (!tool) return next();

    const paymentHeader =
      c.req.header("PAYMENT-SIGNATURE") ||
      c.req.header("X-PAYMENT") ||
      c.req.header("payment-signature");

    const resourceUrl = new URL(c.req.url).toString();

    if (!paymentHeader) {
      const ua = (c.req.header("user-agent") || "").toLowerCase();
      const isOval = ua.includes("awal") || ua.includes("oval");
      const config = isOval
        ? buildPaymentConfigOval(cfg, resourceUrl, tool.desc, tool.priceUsd)
        : buildPaymentConfig(cfg, resourceUrl, tool.desc, tool.priceUsd);

      return new Response(JSON.stringify(config), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": b64(config),
        },
      });
    }

    const requirements = buildAccepts(cfg, tool.priceUsd);
    const ok = await verifyAndSettle(cfg.facilitatorUrl, paymentHeader, requirements);
    if (!ok) {
      return new Response("Payment verification failed", { status: 402 });
    }

    return next();
  };
}
