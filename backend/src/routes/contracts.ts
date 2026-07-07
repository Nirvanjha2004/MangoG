import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import {
  uploadDocument,
  createSignatureRequest,
  getSignatureStatus,
  downloadSignedDocument,
} from "../services/setu.js";
import * as supabase from "../services/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ── Types ──

type SignatureStatus = "pending" | "signed" | "expired";

interface SignatureInfo {
  signatureId: string;
  signatureUrl: string;
  status: SignatureStatus;
  createdAt: string;
  signedAt: string | null;
  setuDocumentId?: string;
}

interface Contract {
  id: number;
  documentId: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  status: "pending" | "processed" | "failed";
  uploadedAt: string;
  notes: string | null;
  signature: SignatureInfo;
}

// ── In-memory fallback storage (used when Supabase is not configured) ──

let memoryContracts: Contract[] = [];
let memoryNextId = 1;

function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── File upload setup ──

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const uploadDir = path.resolve(__dirname, "../../uploads/contracts");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const isValidPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");

    if (!isValidPdf) {
      cb(new Error("Only PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});

// ── Helpers ──

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

function isPdfMagic(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    const bytesRead = fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return bytesRead === 4 && buf.equals(PDF_MAGIC);
  } catch {
    return false;
  }
}

function generateDocumentId(): string {
  return `doc_${crypto.randomBytes(12).toString("hex")}`;
}

/** Map Setu's overall status to our simplified status enum. */
function mapSetuStatus(
  setuStatus: string,
  updatedAt: string
): { status: SignatureStatus; signedAt: string | null } {
  switch (setuStatus) {
    case "sign_complete":
      return { status: "signed", signedAt: updatedAt };
    case "sign_initiated":
    case "sign_pending":
    case "sign_in_progress":
      return { status: "pending", signedAt: null };
    default:
      return { status: "pending", signedAt: null };
  }
}

// ── Storage adapters (Supabase vs in-memory) ──

async function storeContract(contract: Contract): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.createContract({
        documentId: contract.documentId,
        filename: contract.filename,
        originalName: contract.originalName,
        sizeBytes: contract.sizeBytes,
        notes: contract.notes,
        signatureId: contract.signature.signatureId,
        signatureUrl: contract.signature.signatureUrl,
        signatureStatus: contract.signature.status,
        setuDocumentId: contract.signature.setuDocumentId,
        storageFilePath: undefined,
      });
      return;
    } catch (err) {
      console.error("[DB] Supabase store failed, falling back to memory:", err);
    }
  }
  memoryContracts.push(contract);
}

async function findAllContracts(): Promise<Contract[]> {
  if (isSupabaseConfigured()) {
    try {
      return await supabase.getAllContracts();
    } catch (err) {
      console.error("[DB] Supabase query failed, falling back to memory:", err);
    }
  }
  return [...memoryContracts].reverse();
}

async function findContractBySignatureId(
  signatureId: string
): Promise<Contract | null> {
  if (isSupabaseConfigured()) {
    try {
      return await supabase.getContractBySignatureId(signatureId);
    } catch (err) {
      console.error("[DB] Supabase query failed, falling back to memory:", err);
    }
  }
  return memoryContracts.find((c) => c.signature.signatureId === signatureId) || null;
}

async function findContractById(id: number): Promise<Contract | null> {
  if (isSupabaseConfigured()) {
    try {
      return await supabase.getContractById(id);
    } catch (err) {
      console.error("[DB] Supabase query failed, falling back to memory:", err);
    }
  }
  return memoryContracts.find((c) => c.id === id) || null;
}

async function findContractByDocumentId(
  documentId: string
): Promise<Contract | null> {
  if (isSupabaseConfigured()) {
    try {
      return await supabase.getContractByDocumentId(documentId);
    } catch (err) {
      console.error("[DB] Supabase query failed, falling back to memory:", err);
    }
  }
  return memoryContracts.find((c) => c.documentId === documentId) || null;
}

async function updateContractSignature(
  signatureId: string,
  status: SignatureStatus,
  signedAt: string | null
): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.updateSignature(signatureId, {
        status,
        signedAt,
        contractStatus: status === "signed" ? "processed" : undefined,
      });
      return;
    } catch (err) {
      console.error("[DB] Supabase update failed, falling back to memory:", err);
    }
  }
  const contract = memoryContracts.find((c) => c.signature.signatureId === signatureId);
  if (contract) {
    contract.signature.status = status;
    if (signedAt) contract.signature.signedAt = signedAt;
    if (status === "signed") contract.status = "processed";
  }
}

async function removeContract(id: number): Promise<Contract | null> {
  if (isSupabaseConfigured()) {
    try {
      const contract = await supabase.getContractById(id);
      if (contract) {
        await supabase.deleteContract(id);
      }
      return contract;
    } catch (err) {
      console.error("[DB] Supabase delete failed, falling back to memory:", err);
    }
  }
  const index = memoryContracts.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const [contract] = memoryContracts.splice(index, 1);
  return contract;
}

// ── Routes ──

/**
 * POST /api/upload-contract
 * Upload a PDF, store it, and create a Setu e-signature request.
 */
router.post("/upload-contract", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "File exceeds the 10 MB size limit" });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    // Verify PDF magic bytes
    if (!isPdfMagic(file.path)) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: "Uploaded file is not a valid PDF" });
      return;
    }

    const rawNotes = req.body.notes;
    const notes =
      typeof rawNotes === "string" && rawNotes.trim().length > 0
        ? rawNotes.trim().slice(0, 1000)
        : null;

    const documentId = generateDocumentId();
    const now = new Date();

    // Try to integrate with Setu
    let setuDocumentId: string | undefined;
    let setuSignatureId: string | undefined;
    let signatureUrl: string | undefined;
    let setuConfigured = false;

    try {
      // Step 1: Upload the PDF document to Setu
      const doc = await uploadDocument(file.path, file.originalname);
      setuDocumentId = doc.id;

      // Step 2: Create a signature request on Setu
      const redirectUrl =
        process.env.SETU_REDIRECT_URL ||
        `${req.protocol}://${req.get("host") || "localhost:3001"}/status`;

      const signatureReq = await createSignatureRequest(doc.id, redirectUrl, [
        {
          identifier: "9876543210",
          displayName: "Contract Signer",
          birthYear: "1990",
          signature: {
            onPages: ["1"],
            position: "bottom-left",
            height: 60,
            width: 180,
          },
        },
      ]);

      setuSignatureId = signatureReq.id;
      signatureUrl = signatureReq.signers[0]?.url || "";
      setuConfigured = true;

      console.log(
        `[Setu] Signature request created: ${signatureReq.id} for document ${doc.id}`
      );
    } catch (setuError) {
      // If Setu is not configured, fall back to a mock signature
      console.error("have recieved this error : ", setuError)
      const mockSigId = `sig_${crypto.randomBytes(12).toString("hex")}`;
      setuSignatureId = mockSigId;
      // Use Origin header (frontend URL) if available, otherwise fall back to host
      const frontendUrl = req.get("origin") || `${req.protocol}://${req.get("host") || "localhost:5173"}`;
      signatureUrl = `${frontendUrl}/sign/${documentId}`;

      if (
        process.env.SETU_X_CLIENT_ID &&
        process.env.SETU_X_CLIENT_ID !== "your_client_id_here"
      ) {
        console.error("[Setu] API call failed, falling back to mock:", setuError);
      }
    }

    // Upload to Supabase Storage (if configured)
    let storageFilePath: string | undefined;
    if (isSupabaseConfigured()) {
      try {
        storageFilePath = await supabase.uploadToStorage(file.path, file.originalname);
      } catch (storageErr) {
        console.warn("[Storage] Could not upload to Supabase:", storageErr);
      }
    }

    // Store contract
    const id = isSupabaseConfigured() ? 0 : memoryNextId++;
    const contract: Contract = {
      id,
      documentId,
      filename: storageFilePath || file.filename,
      originalName: file.originalname,
      sizeBytes: file.size,
      status: "pending",
      uploadedAt: now.toISOString(),
      notes,
      signature: {
        signatureId: setuSignatureId!,
        signatureUrl: signatureUrl!,
        status: "pending",
        createdAt: now.toISOString(),
        signedAt: null,
        setuDocumentId,
      },
    };

    await storeContract(contract);

    console.log(
      `Contract uploaded: ${contract.originalName}` +
        ` (docId=${documentId}, sigId=${contract.signature.signatureId}` +
        (setuConfigured ? ", Setu=yes" : ", Setu=no (mock)") +
        (isSupabaseConfigured() ? ", DB=Supabase" : ", DB=memory") +
        ")"
    );

    res.status(201).json({
      documentId: contract.documentId,
      signatureId: contract.signature.signatureId,
      signatureUrl: contract.signature.signatureUrl,
      status: contract.signature.status,
      originalName: contract.originalName,
      sizeBytes: contract.sizeBytes,
      setuConfigured,
      storage: isSupabaseConfigured() ? "supabase" : "memory",
    });
  });
});

/**
 * GET /api/signature-status/:id
 * Check the status of a signature request by its signature ID.
 */
router.get("/signature-status/:id", async (req, res) => {
  const { id } = req.params;

  const contract = await findContractBySignatureId(id);
  if (!contract) {
    res.status(404).json({ error: "Signature not found" });
    return;
  }

  if (contract.signature.setuDocumentId) {
    try {
      const setuStatus = await getSignatureStatus(contract.signature.signatureId);

      const { status, signedAt } = mapSetuStatus(
        setuStatus.status,
        setuStatus.updatedAt
      );

      await updateContractSignature(contract.signature.signatureId, status, signedAt);

      const updated = await findContractBySignatureId(id);

      res.json({
        signatureId: contract.signature.signatureId,
        documentId: contract.documentId,
        originalName: contract.originalName,
        status,
        createdAt: contract.signature.createdAt,
        signedAt: signedAt || contract.signature.signedAt,
        signedDocumentAvailable: status === "signed",
        setuStatus: setuStatus.status,
        setuSigners: setuStatus.signers.map((s) => ({
          name: s.name,
          status: s.status,
          signedAt: s.signedAt || null,
        })),
      });
      return;
    } catch (setuError) {
      console.error("[Setu] Failed to fetch live status:", setuError);
    }
  }

  const cached = await findContractBySignatureId(id);
  if (!cached) {
    res.status(404).json({ error: "Signature not found" });
    return;
  }

  res.json({
    signatureId: cached.signature.signatureId,
    documentId: cached.documentId,
    originalName: cached.originalName,
    status: cached.signature.status,
    createdAt: cached.signature.createdAt,
    signedAt: cached.signature.signedAt,
    signedDocumentAvailable: cached.signature.status === "signed",
  });
});

/**
 * GET /api/download/:id
 * Download a signed document by its signature ID.
 */
router.get("/download/:id", async (req, res) => {
  const { id } = req.params;

  const contract = await findContractBySignatureId(id);
  if (!contract) {
    res.status(404).json({ error: "Signature not found" });
    return;
  }

  if (contract.signature.status !== "signed") {
    res.status(400).json({ error: "Document has not been signed yet" });
    return;
  }

  // If Setu signature, proxy the download from Setu
  if (contract.signature.setuDocumentId) {
    try {
      const { stream, contentType } = await downloadSignedDocument(
        contract.signature.signatureId
      );

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="signed_${contract.originalName}"`
      );

      (stream as any).pipe(res);
      return;
    } catch (setuError) {
      console.error("[Setu] Failed to download from Setu, falling back:", setuError);
    }
  }

  // Try Supabase Storage first (if configured)
  if (isSupabaseConfigured()) {
    try {
      const { data, contentType } = await supabase.downloadFromStorage(contract.filename);
      const buffer = Buffer.from(data);

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="signed_${contract.originalName}"`
      );
      res.send(buffer);
      return;
    } catch (storageErr) {
      console.warn("[Storage] Could not download from Supabase:", storageErr);
    }
  }

  // Fall back to local file
  const filePath = path.join(uploadDir, contract.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Signed document file not found" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="signed_${contract.originalName}"`
  );
  res.sendFile(filePath);
});

// ──────────────────────────────────────────────
//  Internal/legacy routes
// ──────────────────────────────────────────────

// List all contracts
router.get("/contracts", async (_req, res) => {
  try {
    const all = await findAllContracts();
    res.json(all);
  } catch (err) {
    console.error("[DB] Failed to list contracts:", err);
    res.status(500).json({ error: "Failed to list contracts" });
  }
});

// Get contract by ID
router.get("/contracts/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const contract = await findContractById(id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  res.json(contract);
});

// Get signature status for a contract (by contract ID)
router.get("/contracts/:id/signature", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const contract = await findContractById(id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  res.json(contract.signature);
});

// Mock sign a document (by contract ID)
router.post("/contracts/:id/sign", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const contract = await findContractById(id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  if (contract.signature.status === "signed") {
    res.status(400).json({ error: "Document is already signed" });
    return;
  }

  const now = new Date().toISOString();
  await updateContractSignature(contract.signature.signatureId, "signed", now);

  console.log(`Document signed (mock): ${contract.documentId}`);
  res.json({
    signatureId: contract.signature.signatureId,
    signatureUrl: contract.signature.signatureUrl,
    status: "signed" as const,
    createdAt: contract.signature.createdAt,
    signedAt: now,
  });
});

// Look up signature by documentId (used by the signing page)
router.get("/documents/:documentId/signature", async (req, res) => {
  const { documentId } = req.params;

  const contract = await findContractByDocumentId(documentId);
  if (!contract) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(contract.signature);
});

// Mock sign by documentId (used by the signing page)
router.post("/documents/:documentId/sign", async (req, res) => {
  const { documentId } = req.params;

  const contract = await findContractByDocumentId(documentId);
  if (!contract) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (contract.signature.status === "signed") {
    res.status(400).json({ error: "Document is already signed" });
    return;
  }

  const now = new Date().toISOString();
  await updateContractSignature(contract.signature.signatureId, "signed", now);

  console.log(`Document signed (mock): ${contract.documentId}`);
  res.json({
    signatureId: contract.signature.signatureId,
    signatureUrl: contract.signature.signatureUrl,
    status: "signed" as const,
    createdAt: contract.signature.createdAt,
    signedAt: now,
  });
});

// Delete a contract
router.delete("/contracts/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const contract = await removeContract(id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  // Clean up local file if it exists
  const filePath = path.join(uploadDir, contract.filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (fsErr) {
    console.warn(`Could not delete file: ${contract.filename}`, fsErr);
  }

  res.json({ success: true });
});

export { router as contractsRouter };
