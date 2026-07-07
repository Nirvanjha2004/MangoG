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

let contracts: Contract[] = [];
let nextId = 1;

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

// ── Routes ──

// ──────────────────────────────────────────────
//  User-requested Setu-integrated routes
// ──────────────────────────────────────────────

/**
 * POST /api/upload-contract
 * Upload a PDF and create a Setu e-signature request in one call.
 * Returns the signature ID, Setu signing URL, and document metadata.
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
      const mockSigId = `sig_${crypto.randomBytes(12).toString("hex")}`;
      setuSignatureId = mockSigId;
      signatureUrl = `${req.protocol}://${req.get("host") || "localhost:3001"}/sign/${documentId}`;

      if (
        process.env.SETU_X_CLIENT_ID &&
        process.env.SETU_X_CLIENT_ID !== "your_client_id_here"
      ) {
        // Setu was configured but the call failed — log the error
        console.error("[Setu] API call failed, falling back to mock:", setuError);
      }
    }

    const signature: SignatureInfo = {
      signatureId: setuSignatureId!,
      signatureUrl: signatureUrl!,
      status: "pending",
      createdAt: now.toISOString(),
      signedAt: null,
      setuDocumentId,
    };

    const contract: Contract = {
      id: nextId++,
      documentId,
      filename: file.filename,
      originalName: file.originalname,
      sizeBytes: file.size,
      status: "pending",
      uploadedAt: now.toISOString(),
      notes,
      signature,
    };

    contracts.push(contract);

    console.log(
      `Contract uploaded: ${contract.originalName}` +
        ` (docId=${documentId}, sigId=${signature.signatureId}` +
        (setuConfigured ? ", Setu=yes" : ", Setu=no (mock)") +
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
    });
  });
});

/**
 * GET /api/signature-status/:id
 * Check the status of a signature request by its signature ID.
 * Fetches the latest status from Setu, then maps it to our internal status.
 */
router.get("/signature-status/:id", async (req, res) => {
  const { id } = req.params;

  const contract = contracts.find((c) => c.signature.signatureId === id);
  if (!contract) {
    res.status(404).json({ error: "Signature not found" });
    return;
  }

  // If this contract was created via Setu, fetch live status from Setu
  if (contract.signature.setuDocumentId) {
    try {
      const setuStatus = await getSignatureStatus(
        contract.signature.signatureId
      );

      const { status, signedAt } = mapSetuStatus(
        setuStatus.status,
        setuStatus.updatedAt
      );

      // Update our local record
      contract.signature.status = status;
      if (signedAt) {
        contract.signature.signedAt = signedAt;
      }
      if (status === "signed") {
        contract.status = "processed";
      }

      res.json({
        signatureId: contract.signature.signatureId,
        documentId: contract.documentId,
        originalName: contract.originalName,
        status,
        createdAt: contract.signature.createdAt,
        signedAt: contract.signature.signedAt,
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
      console.error(
        "[Setu] Failed to fetch live status, using local cache:",
        setuError
      );
      // Fall through to return cached status
    }
  }

  // Return cached/local status (for mock signatures or failed Setu calls)
  res.json({
    signatureId: contract.signature.signatureId,
    documentId: contract.documentId,
    originalName: contract.originalName,
    status: contract.signature.status,
    createdAt: contract.signature.createdAt,
    signedAt: contract.signature.signedAt,
    signedDocumentAvailable: contract.signature.status === "signed",
  });
});

/**
 * GET /api/download/:id
 * Download a signed document by its signature ID.
 * For Setu contracts, proxies the file through our backend.
 * For mock contracts, serves the locally stored file.
 */
router.get("/download/:id", async (req, res) => {
  const { id } = req.params;

  const contract = contracts.find((c) => c.signature.signatureId === id);
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
      console.error(
        "[Setu] Failed to download from Setu, falling back to local:",
        setuError
      );
      // Fall through to try local file
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
//  Internal/legacy routes (kept for compat)
// ──────────────────────────────────────────────

// List all contracts
router.get("/contracts", (_req, res) => {
  const sorted = [...contracts].reverse();
  res.json(sorted);
});

// Get contract by ID
router.get("/contracts/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const contract = contracts.find((c) => c.id === id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  res.json(contract);
});

// Get signature status for a contract (by contract ID)
router.get("/contracts/:id/signature", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const contract = contracts.find((c) => c.id === id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  res.json(contract.signature);
});

// Mock sign a document (by contract ID) — kept for demo
router.post("/contracts/:id/sign", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const contract = contracts.find((c) => c.id === id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  if (contract.signature.status === "signed") {
    res.status(400).json({ error: "Document is already signed" });
    return;
  }

  contract.signature.status = "signed";
  contract.signature.signedAt = new Date().toISOString();
  contract.status = "processed";

  console.log(`Document signed (mock): ${contract.documentId}`);
  res.json(contract.signature);
});

// Look up signature by documentId (used by the signing page)
router.get("/documents/:documentId/signature", (req, res) => {
  const { documentId } = req.params;

  const contract = contracts.find((c) => c.documentId === documentId);
  if (!contract) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(contract.signature);
});

// Mock sign by documentId (used by the signing page)
router.post("/documents/:documentId/sign", (req, res) => {
  const { documentId } = req.params;

  const contract = contracts.find((c) => c.documentId === documentId);
  if (!contract) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (contract.signature.status === "signed") {
    res.status(400).json({ error: "Document is already signed" });
    return;
  }

  contract.signature.status = "signed";
  contract.signature.signedAt = new Date().toISOString();
  contract.status = "processed";

  console.log(`Document signed (mock): ${contract.documentId}`);
  res.json(contract.signature);
});

// Delete a contract
router.delete("/contracts/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid contract ID" });
    return;
  }

  const index = contracts.findIndex((c) => c.id === id);
  if (index === -1) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  const contract = contracts[index];
  contracts.splice(index, 1);

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
