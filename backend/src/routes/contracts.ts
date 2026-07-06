import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// --- Types ---
type SignatureStatus = "pending" | "signed" | "expired";

interface SignatureInfo {
  signatureId: string;
  signatureUrl: string;
  status: SignatureStatus;
  createdAt: string;
  signedAt: string | null;
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

// --- File upload setup ---
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

// --- Helpers ---
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

/** Generate mock signature data — simulates what a real e-signature API would return. */
function createMockSignature(documentId: string): SignatureInfo {
  return {
    signatureId: `sig_${crypto.randomBytes(12).toString("hex")}`,
    signatureUrl: `http://localhost:5173/sign/${documentId}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    signedAt: null,
  };
}

// --- Routes ---

// List all contracts (with signature info)
router.get("/contracts", (_req, res) => {
  const sorted = [...contracts].reverse();
  res.json(sorted);
});

// Upload a contract + create mock signature request
router.post("/contracts/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
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

    const documentId = `doc_${crypto.randomBytes(12).toString("hex")}`;
    const signature = createMockSignature(documentId);

    const contract: Contract = {
      id: nextId++,
      documentId,
      filename: file.filename,
      originalName: file.originalname,
      sizeBytes: file.size,
      status: "pending",
      uploadedAt: new Date().toISOString(),
      notes,
      signature,
    };

    contracts.push(contract);

    console.log(
      `Contract uploaded: ${contract.originalName} (docId=${documentId}, sigId=${signature.signatureId})`
    );

    // Return full contract with signature metadata
    res.status(201).json({
      documentId: contract.documentId,
      signatureId: contract.signature.signatureId,
      signatureUrl: contract.signature.signatureUrl,
      status: contract.signature.status,
      originalName: contract.originalName,
      sizeBytes: contract.sizeBytes,
    });
  });
});

// Get contract by ID (with signature details)
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

// Get signature status for a document
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

// Simulate signing a document (marks it as signed)
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

  console.log(`Document signed: ${contract.documentId}`);
  res.json(contract.signature);
});

// Look up signature status by signatureId (simulates Setu API check)
router.get("/signatures/:signatureId/status", (req, res) => {
  const { signatureId } = req.params;

  const contract = contracts.find((c) => c.signature.signatureId === signatureId);
  if (!contract) {
    res.status(404).json({ error: "Signature not found" });
    return;
  }

  // Simulate what Setu would return
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

// Sign a document by documentId (used by the signing page)
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

  console.log(`Document signed: ${contract.documentId}`);
  res.json(contract.signature);
});

// Download a signed document by contract ID
router.get("/contracts/:id/download", (req, res) => {
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

  if (contract.signature.status !== "signed") {
    res.status(400).json({ error: "Document has not been signed yet" });
    return;
  }

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

// Download a signed document by signature ID
router.get("/signatures/:signatureId/download", (req, res) => {
  const { signatureId } = req.params;

  const contract = contracts.find((c) => c.signature.signatureId === signatureId);
  if (!contract) {
    res.status(404).json({ error: "Signature not found" });
    return;
  }

  if (contract.signature.status !== "signed") {
    res.status(400).json({ error: "Document has not been signed yet" });
    return;
  }

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
