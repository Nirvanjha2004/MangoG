import fs from "fs";
import { Readable } from "stream";
import { proxyDispatcher } from "../config/proxy.js";

// ── Types ──

export interface SetuDocument {
  id: string;
  name: string;
}

export interface SetuSignerInput {
  identifier: string;
  displayName: string;
  birthYear?: string;
  signerNo?: number;
  signature?: {
    onPages: string[];
    position: string;
    height: number;
    width: number;
  };
}

export interface SetuCreateSignatureResponse {
  id: string;
  signers: Array<{
    index: number;
    name: string;
    url: string;
    status: string;
  }>;
}

export type SetuSignatureOverallStatus =
  | "sign_initiated"
  | "sign_pending"
  | "sign_in_progress"
  | "sign_complete";

export interface SetuSignatureStatusResponse {
  id: string;
  documentId: string;
  status: SetuSignatureOverallStatus;
  signers: Array<{
    index: number;
    name: string;
    status: "pending" | "in_progress" | "signed";
    signedAt?: string;
  }>;
  signatureDetails?: {
    aadhaarName?: string;
    gender?: string;
    postalCode?: string;
    birthYear?: string;
    mobileNumber?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SetuDownloadResponse {
  downloadUrl: string;
  id: string;
  validUpto: string;
}

const SETU_TIMEOUT_MS = 15_000;

// ── Config ──

function getConfig() {
  const baseUrl = process.env.SETU_BASE_URL || "https://dg-sandbox.setu.co";
  const clientId = process.env.SETU_X_CLIENT_ID || "";
  const clientSecret = process.env.SETU_X_CLIENT_SECRET || "";
  const productInstanceId = process.env.SETU_X_PRODUCT_INSTANCE_ID || "";

  const missing: string[] = [];
  if (!clientId) missing.push("SETU_X_CLIENT_ID");
  if (!clientSecret) missing.push("SETU_X_CLIENT_SECRET");
  if (!productInstanceId) missing.push("SETU_X_PRODUCT_INSTANCE_ID");

  if (missing.length > 0) {
    console.warn(
      `[Setu] Missing credentials: ${missing.join(", ")}. ` +
        "Setu API calls will fail. Add them to backend/.env"
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    headers: {
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-product-instance-id": productInstanceId,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "application/json, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  };
}

// ── Config diagnostics (call once at startup) ──

/**
 * Log the Setu configuration status at startup.
 * Masks secrets while showing whether values are present.
 */
export function logSetuConfig(): void {
  const baseUrl = process.env.SETU_BASE_URL || "https://dg-sandbox.setu.co (default)";
  const clientId = process.env.SETU_X_CLIENT_ID;
  const clientSecret = process.env.SETU_X_CLIENT_SECRET;
  const productInstanceId = process.env.SETU_X_PRODUCT_INSTANCE_ID;
  const redirectUrl = process.env.SETU_REDIRECT_URL;

  console.log("─".repeat(50));
  console.log("[Setu] Configuration:");
  console.log(`  SETU_BASE_URL:            ${baseUrl}`);
  console.log(`  SETU_X_CLIENT_ID:         ${clientId ? `${clientId.slice(0, 4)}...${clientId.slice(-4)} (${clientId.length} chars)` : "⚠️  NOT SET"}`);
  console.log(`  SETU_X_CLIENT_SECRET:     ${clientSecret ? `${clientSecret.slice(0, 4)}...${clientSecret.slice(-4)} (${clientSecret.length} chars)` : "⚠️  NOT SET"}`);
  console.log(`  SETU_X_PRODUCT_INSTANCE_ID: ${productInstanceId ? `${productInstanceId.slice(0, 4)}...${productInstanceId.slice(-4)} (${productInstanceId.length} chars)` : "⚠️  NOT SET"}`);
  console.log(`  SETU_REDIRECT_URL:        ${redirectUrl || "⚠️  NOT SET (will use request Origin/host)"}`);
  console.log("─".repeat(50));

  const missing: string[] = [];
  if (!clientId) missing.push("SETU_X_CLIENT_ID");
  if (!clientSecret) missing.push("SETU_X_CLIENT_SECRET");
  if (!productInstanceId) missing.push("SETU_X_PRODUCT_INSTANCE_ID");

  if (missing.length > 0) {
    console.warn(`[Setu] ⚠️  Missing ${missing.length} credential(s): ${missing.join(", ")}`);
    console.warn("[Setu] ⚠️  All Setu API calls will FAIL until these are set.");
    console.warn("[Setu] ⚠️  Add them in your Render dashboard: Dashboard → Environment Variables");
  } else {
    console.log("[Setu] ✅ All credentials are configured");
  }

  // Log the Node.js version for diagnosing runtime issues
  console.log(`[Setu] Node.js version: ${process.version}`);
  console.log(`[Setu] Platform: ${process.platform} ${process.arch}`);
  console.log(`[Setu] Runtime: ${typeof globalThis.fetch !== "undefined" ? "✅ fetch available" : "❌ fetch NOT available"}`);
}

// ── Header masking helper ──

function maskHeaderValue(key: string, value: string): string {
  if (!value) return "(empty)";
  // Never fully expose secrets in logs
  if (
    key.toLowerCase().includes("secret") ||
    key.toLowerCase().includes("key") ||
    key.toLowerCase().includes("token") ||
    key.toLowerCase().includes("auth") ||
    key.toLowerCase().includes("authorization")
  ) {
    return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`;
  }
  // For IDs, show first/last few chars
  if (key.toLowerCase().includes("id") || key.toLowerCase().includes("instance")) {
    return value.length > 10
      ? `${value.slice(0, 6)}...${value.slice(-4)} (${value.length} chars)`
      : value;
  }
  return value;
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    masked[key] = maskHeaderValue(key, value);
  }
  return masked;
}

// ── Diagnostic helper ──

/**
 * Log comprehensive request/response diagnostics.
 * Logs the full response body when there's an error (especially useful
 * for 403 where Setu/Cloudflare may return HTML instead of JSON).
 */
async function logSetuDiagnostics(
  label: string,
  url: string,
  method: string,
  requestHeaders: Record<string, string>,
  response: Response,
  requestBodyPreview?: string
): Promise<string> {
  const cfRay = response.headers.get("cf-ray");
  const server = response.headers.get("server");
  const contentType = response.headers.get("content-type") || "unknown";
  const contentLength = response.headers.get("content-length");

  console.log("─".repeat(50));
  console.log(`[Setu][${label}] 📤 REQUEST:`);
  console.log(`  Method:  ${method}`);
  console.log(`  URL:     ${url}`);
  console.log(`  Headers: ${JSON.stringify(maskHeaders(requestHeaders), null, 4)}`);
  if (requestBodyPreview) {
    console.log(`  Body:    ${requestBodyPreview}`);
  }

  console.log(`[Setu][${label}] 📥 RESPONSE:`);
  console.log(`  Status:        ${response.status} ${response.statusText}`);
  console.log(`  Content-Type:  ${contentType}`);
  console.log(`  Content-Length: ${contentLength || "unknown"}`);
  console.log(`  Server header: ${server || "none"}`);

  if (cfRay) {
    console.warn(`  ⚠️  cf-ray: ${cfRay}`);
    console.warn(
      `  ⚠️  This request went through Cloudflare! Render's outbound IP may be blocked by Cloudflare WAF rules.`
    );
  }

  // Log all response headers for debugging
  console.log(`[Setu][${label}] Response headers:`);
  response.headers.forEach((val, key) => {
    // Mask set-cookie and auth-related headers
    if (key.toLowerCase().includes("set-cookie")) {
      console.log(`  ${key}: ${val.slice(0, 40)}... (truncated)`);
    } else {
      console.log(`  ${key}: ${val}`);
    }
  });

  // Try to read the response body for diagnostic purposes.
  // We clone the response because we need to read it without consuming the original.
  let errorBody: string | null = null;
  try {
    const cloned = response.clone();
    errorBody = await cloned.text().catch(() => null);
  } catch {
    // If we can't clone/read, that's fine
  }

  if (errorBody) {
    const trimmed = errorBody.length > 2000 ? errorBody.slice(0, 2000) + `\n... [truncated, full length: ${errorBody.length} chars]` : errorBody;
    console.log(`[Setu][${label}] Response body:`);
    // If it looks like HTML (common for Cloudflare WAF blocks), flag it
    if (errorBody.trim().startsWith("<")) {
      console.warn(`  ⚠️  Response is HTML (not JSON). This often means Cloudflare/Setu WAF blocked the request.`);
      // Extract title if HTML
      const titleMatch = errorBody.match(/<title>([^<]*)<\/title>/i);
      if (titleMatch) {
        console.warn(`  ⚠️  HTML title: "${titleMatch[1]}"`);
      }
      // Look for common WAF/captcha indicators
      if (errorBody.toLowerCase().includes("cf-browser-verification") || errorBody.includes("challenge-platform")) {
        console.warn("  ⚠️  Cloudflare challenge page detected! Render's IP may need to be allowlisted.");
      }
      if (errorBody.toLowerCase().includes("waf") || errorBody.toLowerCase().includes("blocked")) {
        console.warn("  ⚠️  WAF block detected!");
      }
      if (errorBody.toLowerCase().includes("captcha") || errorBody.toLowerCase().includes("recaptcha")) {
        console.warn("  ⚠️  CAPTCHA challenge detected!");
      }
      if (errorBody.toLowerCase().includes("access denied") || errorBody.toLowerCase().includes("access_denied")) {
        console.warn("  ⚠️  Access denied — IP may not be allowlisted on Setu's end.");
      }
      if (errorBody.includes("405") || errorBody.toLowerCase().includes("not allowed")) {
        console.warn("  ⚠️  Method not allowed — check if the endpoint supports this HTTP method.");
      }
    } else {
      console.log(`  ${trimmed}`);
    }
  } else {
    console.log(`  (no response body)`);
  }

  console.log("─".repeat(50));

  return errorBody || "";
}

// ── API Client ──

export async function uploadDocument(
  filePath: string,
  fileName: string
): Promise<SetuDocument> {
  const { baseUrl, headers } = getConfig();
  const url = `${baseUrl}/api/documents`;

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: "application/pdf" });

  const formData = new FormData();
  formData.append("name", fileName);
  formData.append("document", blob, fileName);

  console.log(`[Setu] 🚀 uploadDocument: uploading "${fileName}" (${fileBuffer.length} bytes) to ${url}`);

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      dispatcher: proxyDispatcher,
      signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
    } as any);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Setu][uploadDocument] ❌ NETWORK ERROR after ${elapsed}ms:`);
    console.error(`  URL:    ${url}`);
    console.error(`  Method: POST`);
    console.error(`  Error:  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Stack:  ${err instanceof Error ? err.stack : "(no stack)"}`);
    console.error(`  Headers used: ${JSON.stringify(maskHeaders(headers), null, 4)}`);
    console.error(`  ℹ️  Request was routed through Webshare proxy (p.webshare.io:80)`);
    console.error(`  ℹ️  If this error persists, check: WEBSHARE_PROXY_USERNAME / WEBSHARE_PROXY_PASSWORD`);
    throw new Error(
      `Setu uploadDocument network error after ${elapsed}ms (via Webshare proxy): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Setu][uploadDocument] ⏱  ${elapsed}ms`);

  const errorBody = await logSetuDiagnostics(
    "uploadDocument",
    url,
    "POST",
    headers,
    response,
    `name="${fileName}", fileSize=${fileBuffer.length}`
  );

  if (!response.ok) {
    throw new Error(
      `Setu uploadDocument failed (${response.status}) after ${elapsed}ms: ${errorBody || "Unknown error"}`
    );
  }

  return response.json() as Promise<SetuDocument>;
}

export async function createSignatureRequest(
  documentId: string,
  redirectUrl: string,
  signers: SetuSignerInput[]
): Promise<SetuCreateSignatureResponse> {
  const { baseUrl, headers } = getConfig();
  const url = `${baseUrl}/api/signature`;

  const body = {
    documentId,
    redirectUrl,
    signers,
  };

  const requestHeaders = {
    ...headers,
    "Content-Type": "application/json",
  };

  const bodyPreview = JSON.stringify({
    documentId,
    redirectUrl,
    signers: signers.map((s) => ({
      ...s,
      identifier: s.identifier.slice(0, 4) + "****", // mask signer identifier in logs
    })),
  });

  console.log(`[Setu] 🚀 createSignatureRequest: docId=${documentId}, redirectUrl=${redirectUrl}`);
  console.log(`[Setu]   Signers: ${signers.map((s) => `${s.displayName} (${s.identifier.slice(0, 4)}****)`).join(", ")}`);

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
      dispatcher: proxyDispatcher,
      signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
    } as any);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Setu][createSignatureRequest] ❌ NETWORK ERROR after ${elapsed}ms:`);
    console.error(`  URL:    ${url}`);
    console.error(`  Method: POST`);
    console.error(`  Error:  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Stack:  ${err instanceof Error ? err.stack : "(no stack)"}`);
    console.error(`  Headers used: ${JSON.stringify(maskHeaders(requestHeaders), null, 4)}`);
    console.error(`  ℹ️  Request was routed through Webshare proxy (p.webshare.io:80)`);
    console.error(`  ℹ️  If this error persists, check: WEBSHARE_PROXY_USERNAME / WEBSHARE_PROXY_PASSWORD`);
    throw new Error(
      `Setu createSignatureRequest network error after ${elapsed}ms (via Webshare proxy): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Setu][createSignatureRequest] ⏱  ${elapsed}ms`);

  const errorBody = await logSetuDiagnostics(
    "createSignatureRequest",
    url,
    "POST",
    requestHeaders,
    response,
    bodyPreview
  );

  if (!response.ok) {
    throw new Error(
      `Setu createSignatureRequest failed (${response.status}) after ${elapsed}ms: ${errorBody || "Unknown error"}`
    );
  }

  return response.json() as Promise<SetuCreateSignatureResponse>;
}

export async function getSignatureStatus(
  signatureId: string
): Promise<SetuSignatureStatusResponse> {
  const { baseUrl, headers } = getConfig();
  const url = `${baseUrl}/api/signature/${signatureId}`;

  console.log(`[Setu] 🚀 getSignatureStatus: signatureId=${signatureId}`);

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      dispatcher: proxyDispatcher,
      signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
    } as any);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Setu][getSignatureStatus] ❌ NETWORK ERROR after ${elapsed}ms:`);
    console.error(`  URL:    ${url}`);
    console.error(`  Method: GET`);
    console.error(`  Error:  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Stack:  ${err instanceof Error ? err.stack : "(no stack)"}`);
    console.error(`  Headers used: ${JSON.stringify(maskHeaders(headers), null, 4)}`);
    console.error(`  ℹ️  Request was routed through Webshare proxy (p.webshare.io:80)`);
    console.error(`  ℹ️  If this error persists, check: WEBSHARE_PROXY_USERNAME / WEBSHARE_PROXY_PASSWORD`);
    throw new Error(
      `Setu getSignatureStatus network error after ${elapsed}ms (via Webshare proxy): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Setu][getSignatureStatus] ⏱  ${elapsed}ms`);

  const errorBody = await logSetuDiagnostics(
    "getSignatureStatus",
    url,
    "GET",
    headers,
    response
  );

  if (!response.ok) {
    throw new Error(
      `Setu getSignatureStatus failed (${response.status}) after ${elapsed}ms: ${errorBody || "Unknown error"}`
    );
  }

  return response.json() as Promise<SetuSignatureStatusResponse>;
}

export async function getDownloadUrl(
  signatureId: string
): Promise<SetuDownloadResponse> {
  const { baseUrl, headers } = getConfig();
  const url = `${baseUrl}/api/signature/${signatureId}/download/`;

  console.log(`[Setu] 🚀 getDownloadUrl: signatureId=${signatureId}`);

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      dispatcher: proxyDispatcher,
      signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
    } as any);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Setu][getDownloadUrl] ❌ NETWORK ERROR after ${elapsed}ms:`);
    console.error(`  URL:    ${url}`);
    console.error(`  Method: GET`);
    console.error(`  Error:  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Stack:  ${err instanceof Error ? err.stack : "(no stack)"}`);
    console.error(`  Headers used: ${JSON.stringify(maskHeaders(headers), null, 4)}`);
    console.error(`  ℹ️  Request was routed through Webshare proxy (p.webshare.io:80)`);
    console.error(`  ℹ️  If this error persists, check: WEBSHARE_PROXY_USERNAME / WEBSHARE_PROXY_PASSWORD`);
    throw new Error(
      `Setu getDownloadUrl network error after ${elapsed}ms (via Webshare proxy): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Setu][getDownloadUrl] ⏱  ${elapsed}ms`);

  const errorBody = await logSetuDiagnostics(
    "getDownloadUrl",
    url,
    "GET",
    headers,
    response
  );

  if (!response.ok) {
    throw new Error(
      `Setu getDownloadUrl failed (${response.status}) after ${elapsed}ms: ${errorBody || "Unknown error"}`
    );
  }

  return response.json() as Promise<SetuDownloadResponse>;
}

export async function downloadSignedDocument(
  signatureId: string
): Promise<{ stream: Readable; contentType: string }> {
  let downloadUrl: string;
  try {
    const dlResponse = await getDownloadUrl(signatureId);
    downloadUrl = dlResponse.downloadUrl;
  } catch (err) {
    console.error(`[Setu][downloadSignedDocument] ❌ Failed to get download URL for ${signatureId}:`, err);
    throw err;
  }

  console.log(`[Setu] 🚀 downloadSignedDocument: fetching from ${downloadUrl}`);

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      dispatcher: proxyDispatcher,
      signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
    } as any);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Setu][downloadSignedDocument] ❌ NETWORK ERROR after ${elapsed}ms:`);
    console.error(`  URL:    ${downloadUrl}`);
    console.error(`  Error:  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Stack:  ${err instanceof Error ? err.stack : "(no stack)"}`);
    console.error(`  ℹ️  Request was routed through Webshare proxy (p.webshare.io:80)`);
    console.error(`  ℹ️  If this error persists, check: WEBSHARE_PROXY_USERNAME / WEBSHARE_PROXY_PASSWORD`);
    throw new Error(
      `Failed to fetch signed document from Setu after ${elapsed}ms (via Webshare proxy): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Setu][downloadSignedDocument] ⏱  ${elapsed}ms`);

  console.log(`[Setu][downloadSignedDocument] Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text().catch(() => "");
    } catch {
      // ignore
    }
    console.error(`[Setu][downloadSignedDocument] ❌ Failed (${response.status}): ${errorBody || "Unknown error"}`);
    throw new Error(
      `Failed to fetch signed document from Setu (${response.status}): ${errorBody}`
    );
  }

  const contentType =
    response.headers.get("content-type") || "application/pdf";

  if (!response.body) {
    console.error(`[Setu][downloadSignedDocument] ❌ Empty response body`);
    throw new Error("Setu returned an empty response body");
  }

  const nodeStream = Readable.from(response.body as any);

  return { stream: nodeStream, contentType };
}
