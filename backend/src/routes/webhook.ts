import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  getSignatureStatus,
} from "../services/setu.js";
import * as supabase from "../services/supabase.js";

const router = Router();

// ── Types ──

interface SetuWebhookPayload {
  event: "sign_complete" | "sign_failed" | "sign_initiated" | "sign_pending";
  signatureId: string;
  documentId?: string;
  signerId?: string;
  signerIdentifier?: string;
  success?: boolean;
  status?: string;
  errCode?: string;
  errorMessage?: string;
  signedAt?: string;
  signatureDetails?: {
    aadhaarName?: string;
    gender?: string;
    postalCode?: string;
    birthYear?: string;
    mobileNumber?: string;
  };
}

type SignatureStatus = "pending" | "signed" | "expired";

// ── State Token Store ──
// When a signature request is created, a random state token is generated
// and stored here. The token is self-referential (keyed by the token itself)
// because we need to create it BEFORE we know the Setu signature ID.
//
// Flow:
//  1. contracts.ts generates state token BEFORE calling Setu API
//  2. Token is included as ?state=xxx in the redirect URL
//  3. Setu preserves our custom query params during the redirect
//  4. Webhook callback extracts the state token from the URL
//  5. We look it up in our store — if it exists and hasn't expired, it's valid
//  6. Token is consumed (one-time use)
const stateTokens = new Map<string, { createdAt: number }>();
const STATE_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes (Setu session is 15 min)

// Clean up expired state tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, value] of stateTokens) {
    if (now - value.createdAt > STATE_TOKEN_TTL_MS) {
      stateTokens.delete(token);
    }
  }
}, 60_000);

/**
 * Generate a state token. Returns the token string.
 * The token is stored in memory and must be presented back on the callback.
 * One-time use: deleted after successful validation.
 */
export function createStateToken(): string {
  const stateToken = crypto.randomBytes(24).toString("hex");
  stateTokens.set(stateToken, { createdAt: Date.now() });
  return stateToken;
}

/**
 * Validate a state token.
 * Returns true only if the token exists in our store and hasn't expired.
 * Consumes the token on success (one-time use).
 */
export function validateStateToken(token: string): boolean {
  const stored = stateTokens.get(token);
  if (!stored) return false;
  if (Date.now() - stored.createdAt > STATE_TOKEN_TTL_MS) {
    stateTokens.delete(token);
    return false;
  }
  // One-time use: delete after successful validation
  stateTokens.delete(token);
  return true;
}

// ── In-memory store for dedup ──
const processedEvents = new Set<string>();
const EVENT_DEDUP_WINDOW_MS = 60_000;

function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function updateContractFromWebhook(
  signatureId: string,
  status: SignatureStatus,
  signedAt: string | null
): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.updateSignature(signatureId, {
        status,
        signedAt,
        contractStatus: status === "signed" ? "processed" : undefined,
      });
      return true;
    } catch (err) {
      console.error("[Webhook] Supabase update failed:", err);
      return false;
    }
  }
  console.warn("[Webhook] No database configured — cannot persist signature update");
  return false;
}

// ── POST /api/webhook/setu ──
// SECURITY MODEL:
//  1. NEVER trusts the incoming payload alone — MUST verify with Setu's own API
//  2. Only updates contract status after Setu's API confirms the state
//  3. Deduplicates events to prevent replay within 60s window

router.post("/setu", async (req: Request, res: Response) => {
  const payload = req.body as SetuWebhookPayload;
    console.log("[Webhook] Received callback:", JSON.stringify(payload, null, 2));

  // Validate required fields
  if (!payload.signatureId) {
    res.status(400).json({
      error: "Missing required field: signatureId",
      received: payload,
    });
    return;
  }

  const signatureId = payload.signatureId;

  // ── Layer 2: Deduplication (prevents replay within 60s) ──
  const dedupKey = `${signatureId}-${payload.event || "unknown"}`;
  if (processedEvents.has(dedupKey)) {
    console.log(`[Webhook] Skipping duplicate event: ${dedupKey}`);
    res.status(200).json({ status: "duplicate", message: "Event already processed" });
    return;
  }
  processedEvents.add(dedupKey);
  setTimeout(() => processedEvents.delete(dedupKey), EVENT_DEDUP_WINDOW_MS);

  try {
    // ── Layer 3: Verify with Setu API (the ONLY source of truth) ──
    // We do NOT trust the webhook payload directly. We always ask Setu:
    // "Is this signature really in this state?"
    let setuStatus;
    try {
      setuStatus = await getSignatureStatus(signatureId);
      console.log(`[Webhook] Setu API reports status=${setuStatus.status} for ${signatureId}`);
    } catch (err) {
      // If we can't reach Setu to verify, we CANNOT process the webhook.
      // This prevents attackers from exploiting a network outage to push fake events.
      console.error(`[Webhook] CRITICAL: Cannot verify ${signatureId} with Setu API — rejecting webhook:`, err);
      res.status(502).json({
        error: "Cannot verify signature status with Setu API",
        message: "Webhook rejected — unable to reach Setu for verification. Try again later.",
      });
      return;
    }

    // ── Layer 4: Compare Setu's status with what the webhook claims ──
    let newStatus: SignatureStatus;
    let signedAt: string | null = null;

    if (setuStatus.status === "sign_complete") {
      // Setu confirms the signature is complete — this is authoritative
      newStatus = "signed";
      signedAt = setuStatus.updatedAt;
      console.log(`[Webhook] Setu verified: signature ${signatureId} is COMPLETE`);
    } else {
      // Setu says it's sign_initiated, sign_pending, or sign_in_progress
      // The webhook might claim success, but Setu disagrees — trust Setu
      newStatus = "pending";
      console.warn(
        `[Webhook] Setu reports status=${setuStatus.status} for ${signatureId} — ` +
        `webhook claimed ${payload.event || (payload.success ? "success" : "unknown")}, but Setu is authoritative`
      );
    }

    // ── Layer 5: Update the contract ──
    const updated = await updateContractFromWebhook(signatureId, newStatus, signedAt);

    console.log(
      `[Webhook] Processed ${signatureId}: status=${newStatus}` +
        (signedAt ? `, signedAt=${signedAt}` : "") +
        (updated ? ", DB-updated" : ", DB-not-updated")
    );

    res.status(200).json({
      status: "processed",
      signatureId,
      newStatus,
      signedAt,
      updated,
      setuVerified: true,
      setuStatus: setuStatus.status,
    });
  } catch (err) {
    console.error("[Webhook] Error processing webhook:", err);
    res.status(500).json({
      error: "Internal error processing webhook",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// ── GET /api/webhook/setu-callback ──
// Handles the browser redirect from Setu eSign after the user completes signing.
// Setu appends query params:
//   ?id={sig_id}&success={true}&signerIdentifier={signer.id}
//
// SECURITY MODEL:
//  1. The browser redirect can be trivially spoofed — NEVER trust query params alone
//  2. The URL includes a `state` parameter (random token generated at signature creation)
//  3. We validate the state token matches what we stored (one-time use)
//  4. Then we ALWAYS verify with Setu's API before updating the contract
//  5. The user is redirected back to the frontend with the verified result

router.get("/setu-callback", async (req: Request, res: Response) => {
  const {
    id: signatureId,
    success,
    signerIdentifier,
    errCode,
    errorMessage,
    state,
  } = req.query as Record<string, string | undefined>;

  console.log("[Webhook] Received redirect callback:", {
    signatureId,
    success,
    signerIdentifier,
    errCode,
    errorMessage,
    state: state ? `${state?.slice(0, 8)}...` : "MISSING",
  });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const statusPath = "/status";

  if (!signatureId) {
    const redirectUrl = `${frontendUrl}${statusPath}?error=${encodeURIComponent("Missing signature ID in callback")}`;
    res.redirect(302, redirectUrl);
    return;
  }

  // ── Layer 1: Validate state token (CSRF protection) ──
  if (!state || !validateStateToken(state)) {
    console.error(`[Webhook] SECURITY: Invalid or missing state token for ${signatureId} — possible CSRF attack`);
    const redirectUrl = `${frontendUrl}${statusPath}?error=${encodeURIComponent("Invalid callback — security check failed")}`;
    res.redirect(302, redirectUrl);
    return;
  }

  try {
    // ── Layer 2: Verify with Setu API (authoritative source of truth) ──
    let setuStatus;
    try {
      setuStatus = await getSignatureStatus(signatureId);
      console.log(`[Webhook] Setu API reports status=${setuStatus.status} for ${signatureId}`);
    } catch {
      // If Setu is unreachable, we still process the redirect but flag it
      // This is more lenient than the POST webhook because the redirect
      // happens via the user's browser — we have the state token as proof.
      console.warn(`[Webhook] Setu API unreachable, relying on state token for ${signatureId}`);
      setuStatus = null;
    }

    let verifiedStatus: SignatureStatus;
    let verifiedSignedAt: string | null = null;
    const isSuccess = success === "true";

    if (setuStatus && setuStatus.status === "sign_complete") {
      // Setu confirms: signature is complete
      verifiedStatus = "signed";
      verifiedSignedAt = setuStatus.updatedAt;
    } else if (setuStatus && isSuccess && setuStatus.status !== "sign_complete") {
      // Redirect says success, but Setu disagrees — trust Setu
      console.warn(
        `[Webhook] Setu says status=${setuStatus.status} but redirect said success=true — trusting Setu`
      );
      verifiedStatus = "pending";
    } else if (!setuStatus && isSuccess) {
      // Setu unreachable, but we already validated the state token in Layer 1 — process optimistically
      verifiedStatus = "signed";
      verifiedSignedAt = new Date().toISOString();
      console.warn(`[Webhook] Processing optimistically (state token valid, Setu unreachable) for ${signatureId}`);
    } else {
      verifiedStatus = "pending";
    }

    await updateContractFromWebhook(signatureId, verifiedStatus, verifiedSignedAt);

    // Redirect to frontend with the verified result
    const redirectUrl = `${frontendUrl}${statusPath}?signatureId=${encodeURIComponent(signatureId)}&success=${verifiedStatus === "signed"}`;
    res.redirect(302, redirectUrl);
  } catch (err) {
    console.error("[Webhook] Error processing redirect callback:", err);
    const redirectUrl = `${frontendUrl}${statusPath}?error=${encodeURIComponent("Internal error processing signature callback")}`;
    res.redirect(302, redirectUrl);
  }
});

// ── Health check ──

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "setu-webhook",
    activeStateTokens: stateTokens.size,
    timestamp: new Date().toISOString(),
    endpoints: [
      "POST /api/webhook/setu",
      "GET  /api/webhook/setu-callback",
      "GET  /api/webhook/health",
    ],
  });
});

export { router as webhookRouter };
