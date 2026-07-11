import { fetch, ProxyAgent } from "undici";

// ── Environment variable names (also set these in Render dashboard) ──
//
// Render Dashboard → Your Service → Environment → Add:
//   WEBSHARE_PROXY_HOST     = p.webshare.io
//   WEBSHARE_PROXY_PORT     = 80
//   WEBSHARE_PROXY_USERNAME = (your Webshare username)
//   WEBSHARE_PROXY_PASSWORD = (your Webshare password)
//
// These env vars MUST be set. Without them, Setu API calls will fail
// because Render's dynamic outbound IP won't be whitelisted by Setu.

const PROXY_HOST = process.env.WEBSHARE_PROXY_HOST;
const PROXY_PORT = process.env.WEBSHARE_PROXY_PORT;
const PROXY_USERNAME = process.env.WEBSHARE_PROXY_USERNAME;
const PROXY_PASSWORD = process.env.WEBSHARE_PROXY_PASSWORD;

function validateEnv(): string {
  const missing: string[] = [];
  if (!PROXY_HOST) missing.push("WEBSHARE_PROXY_HOST");
  if (!PROXY_PORT) missing.push("WEBSHARE_PROXY_PORT");
  if (!PROXY_USERNAME) missing.push("WEBSHARE_PROXY_USERNAME");
  if (!PROXY_PASSWORD) missing.push("WEBSHARE_PROXY_PASSWORD");

  if (missing.length > 0) {
    const msg =
      `[Webshare] ❌ FATAL: Missing required proxy environment variables: ${missing.join(", ")}\n` +
      `[Webshare] ❌ Without these, Setu API calls will fail because Render's dynamic IP is not whitelisted.\n` +
      `[Webshare] ❌ Fix: Set them in backend/.env (local dev) and Render dashboard → Environment Variables (production).\n` +
      `[Webshare] ❌ Aborting startup — Setu cannot work without a static outbound IP.`;
    throw new Error(msg);
  }

  return `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`;
}

// ── Build proxy URL ──
// Format: http://username:password@host:port
// Webshare provides HTTP proxies (not HTTPS), but they can tunnel HTTPS traffic.
const PROXY_URL = validateEnv();

console.log(`[Webshare] 🔌 Connecting via proxy at ${PROXY_HOST}:${PROXY_PORT}`);

let _proxyAgent: ProxyAgent;

try {
  _proxyAgent = new ProxyAgent({
    uri: PROXY_URL,
    // Timeout for connecting to the proxy itself
    connect: {
      timeout: 10_000,
    },
    // How long to keep the proxy connection alive in the pool
    keepAliveTimeout: 30_000,
    // Max number of keep-alive connections
    keepAliveMaxTimeout: 60_000,
  });
  console.log(`[Webshare] ✅ ProxyAgent created successfully`);
} catch (err) {
  const msg =
    `[Webshare] ❌ FATAL: Failed to create ProxyAgent for ${PROXY_HOST}:${PROXY_PORT}\n` +
    `[Webshare] ❌ Error: ${err instanceof Error ? err.message : String(err)}\n` +
    `[Webshare] ❌ Check your WEBSHARE_PROXY_* env vars and proxy credentials.`;
  throw new Error(msg);
}

/**
 * The singleton undici ProxyAgent instance configured for Webshare.
 * Pass this as the `dispatcher` option to any native `fetch()` call
 * to route traffic through the Webshare static IP proxy.
 *
 * Usage:
 *   import { proxyDispatcher } from "../config/proxy.js";
 *   const res = await fetch(url, { ..., dispatcher: proxyDispatcher });
 */
export { _proxyAgent as proxyDispatcher };

// ── Proxy status ──

function maskProxyUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username) u.username = u.username.slice(0, 3) + "***";
    if (u.password) u.password = "***" + u.password.slice(-3);
    return u.toString();
  } catch {
    return "(invalid URL)";
  }
}

/** Log comprehensive proxy configuration details (call at startup after imports). */
export function logProxyConfig(): void {
  console.log("─".repeat(50));
  console.log("[Webshare] Proxy Configuration:");
  console.log(`  Host:     ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`  Username: ${PROXY_USERNAME ? `${PROXY_USERNAME.slice(0, 3)}*** (${PROXY_USERNAME.length} chars)` : "⚠️  NOT SET"}`);
  console.log(`  Password: ${PROXY_PASSWORD ? `***${PROXY_PASSWORD.slice(-3)} (${PROXY_PASSWORD.length} chars)` : "⚠️  NOT SET"}`);
  console.log(`  URL:      ${maskProxyUrl(PROXY_URL)}`);
  console.log(`  Agent:    undici.ProxyAgent (keepAlive timeout: 30s)`);
  console.log(`  Purpose:  Route all Setu API calls through Webshare static IP`);
  console.log("─".repeat(50));
}

// ── Outbound IP verification ──

/**
 * Hit ipify through the Webshare proxy and return the visible outbound IP.
 * Useful for verifying that the proxy is working and showing Setu which IP
 * to whitelist.
 *
 * Example:
 *   const ip = await getOutboundIP();
 *   console.log("Outbound IP via proxy:", ip);
 *   // → "203.0.113.42"
 */
export async function getOutboundIP(): Promise<string> {
  console.log(`[Webshare] 🔍 Checking outbound IP via proxy...`);

  const start = Date.now();
  let response;

  try {
    response = await fetch("https://api.ipify.org?format=json", {
      dispatcher: _proxyAgent,
      signal: AbortSignal.timeout(10_000),
    } as any);
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg =
      `[Webshare] ❌ Outbound IP check FAILED after ${elapsed}ms — proxy may not be working.\n` +
      `[Webshare] ❌ Error: ${err instanceof Error ? err.message : String(err)}\n` +
      `[Webshare] ❌ Troubleshooting:\n` +
      `  • Verify WEBSHARE_PROXY_USERNAME and WEBSHARE_PROXY_PASSWORD are correct\n` +
      `  • Verify Webshare subscription is active (https://webshare.io/dashboard)\n` +
      `  • Try the proxy URL directly: curl -x "http://user:pass@p.webshare.io:80" https://api.ipify.org\n` +
      `  • Check Webshare dashboard for proxy status: https://webshare.io/dashboard/proxy-list`;
    throw new Error(msg);
  }

  const elapsed = Date.now() - start;

  if (!response.ok) {
    const body = await response.text().catch(() => "(unknown)");
    throw new Error(
      `[Webshare] ❌ Outbound IP check returned ${response.status} after ${elapsed}ms: ${body}`
    );
  }

  const data = (await response.json()) as { ip: string };
  console.log(`[Webshare] ✅ Outbound IP via proxy: ${data.ip} (fetched in ${elapsed}ms)`);
  console.log(`[Webshare] ℹ️  Provide this IP to Setu for whitelisting.`);
  return data.ip;
}
