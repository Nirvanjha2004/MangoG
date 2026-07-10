import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import crypto from "crypto";

// ── Types ──

/** Raw database row shape. */
interface ContractRow {
  id: number;
  document_id: string;
  filename: string;
  original_name: string;
  size_bytes: number;
  status: "pending" | "processed" | "failed";
  uploaded_at: string;
  notes: string | null;
  signature_id: string;
  signature_url: string;
  signature_status: "pending" | "signed" | "expired";
  signature_created_at: string;
  signature_signed_at: string | null;
  setu_document_id: string | null;
  storage_file_path: string | null;
}

/** Application-level contract shape (camelCase, nested signature). */
export interface Contract {
  id: number;
  documentId: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  status: "pending" | "processed" | "failed";
  uploadedAt: string;
  notes: string | null;
  signature: {
    signatureId: string;
    signatureUrl: string;
    status: "pending" | "signed" | "expired";
    createdAt: string;
    signedAt: string | null;
    setuDocumentId?: string;
  };
}

/** Input data for creating a new contract. */
export interface CreateContractInput {
  documentId: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  notes: string | null;
  signatureId: string;
  signatureUrl: string;
  signatureStatus: "pending" | "signed" | "expired";
  setuDocumentId?: string;
  storageFilePath?: string;
}

// ── Client ──

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env"
    );
  }

  _client = createClient(url, key);
  return _client;
}



// ── Row ↔ Contract conversion ──

function rowToContract(row: ContractRow): Contract {
  return {
    id: row.id,
    documentId: row.document_id,
    filename: row.filename,
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    status: row.status,
    uploadedAt: row.uploaded_at,
    notes: row.notes,
    signature: {
      signatureId: row.signature_id,
      signatureUrl: row.signature_url,
      status: row.signature_status,
      createdAt: row.signature_created_at,
      signedAt: row.signature_signed_at,
      ...(row.setu_document_id ? { setuDocumentId: row.setu_document_id } : {}),
    },
  };
}

// ── Database helpers ──

/** Get all contracts, newest first. */
export async function getAllContracts(): Promise<Contract[]> {
  const client = getClient();
  const { data, error } = await client
    .from("contracts")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return (data as ContractRow[] || []).map(rowToContract);
}

/** Get a contract by its internal numeric ID. */
export async function getContractById(id: number): Promise<Contract | null> {
  const client = getClient();
  const { data, error } = await client
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  return rowToContract(data as ContractRow);
}

/** Get a contract by its document ID (our internal ID). */
export async function getContractByDocumentId(
  documentId: string
): Promise<Contract | null> {
  const client = getClient();
  const { data, error } = await client
    .from("contracts")
    .select("*")
    .eq("document_id", documentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  return rowToContract(data as ContractRow);
}

/** Get a contract by its signature ID (Setu or mock). */
export async function getContractBySignatureId(
  signatureId: string
): Promise<Contract | null> {
  const client = getClient();
  const { data, error } = await client
    .from("contracts")
    .select("*")
    .eq("signature_id", signatureId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  return rowToContract(data as ContractRow);
}

/** Create a new contract row. Returns the full contract. */
export async function createContract(
  input: CreateContractInput
): Promise<Contract> {
  const client = getClient();
  const now = new Date().toISOString();

  const row = {
    document_id: input.documentId,
    filename: input.filename,
    original_name: input.originalName,
    size_bytes: input.sizeBytes,
    status: "pending",
    uploaded_at: now,
    notes: input.notes,
    signature_id: input.signatureId,
    signature_url: input.signatureUrl,
    signature_status: input.signatureStatus,
    signature_created_at: now,
    signature_signed_at: null,
    setu_document_id: input.setuDocumentId || null,
    storage_file_path: input.storageFilePath || null,
  };

  const { data, error } = await client
    .from("contracts")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return rowToContract(data as ContractRow);
}

/** Update the signature portion of a contract. */
export async function updateSignature(
  signatureId: string,
  updates: {
    status?: "pending" | "signed" | "expired";
    signedAt?: string | null;
    contractStatus?: "pending" | "processed" | "failed";
  }
): Promise<void> {
  const client = getClient();
  const dbUpdates: Record<string, any> = {};
  if (updates.status !== undefined) dbUpdates.signature_status = updates.status;
  if (updates.signedAt !== undefined) dbUpdates.signature_signed_at = updates.signedAt;
  if (updates.contractStatus !== undefined) dbUpdates.status = updates.contractStatus;

  const { error } = await client
    .from("contracts")
    .update(dbUpdates)
    .eq("signature_id", signatureId);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

/** Delete a contract by its internal ID. */
export async function deleteContract(id: number): Promise<void> {
  const client = getClient();
  const { error } = await client.from("contracts").delete().eq("id", id);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

// ── Storage helpers ──

const STORAGE_BUCKET = "contracts";

/** Ensure the storage bucket exists. */
export async function ensureStorageBucket(): Promise<void> {
  try {
    const client = getClient();
    const { data: buckets } = await client.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === STORAGE_BUCKET);
    if (!exists) {
      const { error } = await client.storage.createBucket(STORAGE_BUCKET, {
        public: false,
      });
      if (error && error.message !== "Bucket already exists") {
        console.warn(`[Supabase] Could not create bucket '${STORAGE_BUCKET}':`, error.message);
      }
    }
  } catch (err) {
    console.warn("[Supabase] Storage setup failed:", err);
  }
}

/** Upload a local file to Supabase Storage. Returns the storage path. */
export async function uploadToStorage(
  localFilePath: string,
  fileName: string
): Promise<string> {
  const client = getClient();
  const fileBuffer = fs.readFileSync(localFilePath);
  const storagePath = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${fileName}`;

  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
  return storagePath;
}

/** Download a file from Supabase Storage and return it as a buffer. */
export async function downloadFromStorage(
  storagePath: string
): Promise<{ data: ArrayBuffer; contentType: string }> {
  const client = getClient();
  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (error) throw new Error(`Supabase storage download failed: ${error.message}`);
  return {
    data: await data.arrayBuffer(),
    contentType: data.type || "application/pdf",
  };
}

/** Delete a file from Supabase Storage. */
export async function deleteFromStorage(storagePath: string): Promise<void> {
  const client = getClient();
  const { error } = await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
  if (error) throw new Error(`Supabase storage delete failed: ${error.message}`);
}
