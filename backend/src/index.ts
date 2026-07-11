import "dotenv/config";
import app from "./app.js";
import { ensureStorageBucket } from "./services/supabase.js";
import { logSetuConfig } from "./services/setu.js";
import { logProxyConfig, getOutboundIP } from "./config/proxy.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

// ── Runtime compatibility check ──
function checkRuntime() {
  const issues: string[] = [];
  if (typeof globalThis.fetch === "undefined") {
    issues.push("global fetch not available (requires Node.js 18+)");
  }
  if (typeof globalThis.FormData === "undefined") {
    issues.push("FormData not available (requires Node.js 18+)");
  }
  if (typeof globalThis.Blob === "undefined") {
    issues.push("Blob not available (requires Node.js 18+)");
  }
  if (typeof AbortSignal?.timeout !== "function") {
    issues.push("AbortSignal.timeout() not available (requires Node.js 16.14+)");
  }
  if (issues.length > 0) {
    console.warn("⚠️  Runtime compatibility issues:");
    issues.forEach((i) => console.warn(`   - ${i}`));
    console.warn("   Setu API integration will not work until these are resolved.");
    console.warn("   Set your Node.js version to 18+ in Render dashboard.");
  } else {
    console.log("✅ Runtime APIs available (fetch, FormData, Blob, AbortSignal.timeout)");
  }
}

async function start() {
  checkRuntime();

  // Supabase is optional at runtime.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await ensureStorageBucket();
      console.log("✅ Supabase connected and ready");
    } catch (dbErr) {
      console.warn("⚠️  Supabase setup failed, falling back to in-memory storage:", dbErr);
    }
  } else {
    console.log("ℹ️  Supabase not configured — using in-memory storage");
    console.log("   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env to persist data");
  }

  // Log Setu configuration at startup for debugging deployment issues
  logSetuConfig();

  // Log Webshare proxy configuration
  logProxyConfig();

  // Verify proxy by checking outbound IP (non-blocking — won't delay startup)
  getOutboundIP().catch((err) => {
    console.error(`[Startup] ⚠️  Proxy verification failed (non-fatal):`);
    console.error(`[Startup] ⚠️  ${err instanceof Error ? err.message : String(err)}`);
  });

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  });
}

start();
