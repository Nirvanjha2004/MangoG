import fs from "fs";
import path from "path";
import { Readable } from "stream";

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
      "User-Agent": "MangoG/1.0",
      Accept: "application/json, */*",
    },
  };
}

// ── API Client ──

/**
 * Upload a PDF document to Setu.
 * Returns the document ID needed to create a signature request.
 */
export async function uploadDocument(
  filePath: string,
  fileName: string
): Promise<SetuDocument> {
  const { baseUrl, headers } = getConfig();

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: "application/pdf" });

  const formData = new FormData();
  formData.append("name", fileName);
  formData.append("document", blob, fileName);

  const response = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Setu uploadDocument failed (${response.status}): ${errorText}`
    );
  }

  return response.json() as Promise<SetuDocument>;
}

/**
 * Create a signature request for a previously uploaded document.
 * Returns the signature request ID and signer URLs.
 */
export async function createSignatureRequest(
  documentId: string,
  redirectUrl: string,
  signers: SetuSignerInput[]
): Promise<SetuCreateSignatureResponse> {
  const { baseUrl, headers } = getConfig();

  const body = {
    documentId,
    redirectUrl,
    signers,
  };

  const response = await fetch(`${baseUrl}/api/signature`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Setu createSignatureRequest failed (${response.status}): ${errorText}`
    );
  }

  return response.json() as Promise<SetuCreateSignatureResponse>;
}

/**
 * Get the current status of a signature request by its Setu signature ID.
 */
export async function getSignatureStatus(
  signatureId: string
): Promise<SetuSignatureStatusResponse> {
  const { baseUrl, headers } = getConfig();

  const response = await fetch(`${baseUrl}/api/signature/${signatureId}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Setu getSignatureStatus failed (${response.status}): ${errorText}`
    );
  }

  return response.json() as Promise<SetuSignatureStatusResponse>;
}

/**
 * Get the download URL for a signed document.
 * Only call this after the signature status is "sign_complete".
 */
export async function getDownloadUrl(
  signatureId: string
): Promise<SetuDownloadResponse> {
  const { baseUrl, headers } = getConfig();

  const response = await fetch(
    `${baseUrl}/api/signature/${signatureId}/download/`,
    {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Setu getDownloadUrl failed (${response.status}): ${errorText}`
    );
  }

  return response.json() as Promise<SetuDownloadResponse>;
}

/**
 * Proxy-download a signed document from Setu and return it as a Readable stream.
 * This keeps Setu URLs hidden from the frontend.
 */
export async function downloadSignedDocument(
  signatureId: string
): Promise<{ stream: Readable; contentType: string }> {
  const { downloadUrl } = await getDownloadUrl(signatureId);

  const response = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(SETU_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch signed document from Setu (${response.status})`
    );
  }

  const contentType =
    response.headers.get("content-type") || "application/pdf";

  if (!response.body) {
    throw new Error("Setu returned an empty response body");
  }

  // Convert the web ReadableStream to a Node Readable
  const nodeStream = Readable.from(response.body as any);

  return { stream: nodeStream, contentType };
}
