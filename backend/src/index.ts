import "dotenv/config";
import app from "./app.js";
import { runMigrations, ensureStorageBucket } from "./services/supabase.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

async function start() {
  // Attempt to set up Supabase (non-blocking — falls back to in-memory if not configured)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await runMigrations();
      await ensureStorageBucket();
      console.log("✅ Supabase connected and ready");
    } catch (dbErr) {
      console.warn("⚠️  Supabase setup failed, falling back to in-memory storage:", dbErr);
    }
  } else {
    console.log("ℹ️  Supabase not configured — using in-memory storage");
    console.log("   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env to persist data");
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Setu base URL: ${process.env.SETU_BASE_URL || "https://dg-sandbox.setu.co"}`);
    if (!process.env.SETU_X_CLIENT_ID) {
      console.warn("⚠️  Setu credentials not configured. Add them to backend/.env");
      console.warn("   See backend/.env.example for the required variables.");
    }
  });
}

start();
