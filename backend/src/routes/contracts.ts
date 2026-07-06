import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, desc } from "drizzle-orm";
import { db, contractsTable } from "@workspace/db";
import {
  ListContractsResponse,
  UploadContractResponse,
  GetContractParams,
  GetContractResponse,
  DeleteContractParams,
  DeleteContractResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const uploadDir = path.join(process.cwd(), "uploads", "contracts");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

/** Check the first 4 bytes of a file for the PDF magic signature. */
function isPdfMagic(filePath: string): boolean {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(4);
  try {
    const bytesRead = fs.readSync(fd, buf, 0, 4, 0);
    return bytesRead === 4 && buf.equals(PDF_MAGIC);
  } finally {
    fs.closeSync(fd);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    // First-pass: MIME + extension check (fast, before disk write)
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      cb(new Error("Only PDF files are allowed"));
    } else {
      cb(null, true);
    }
  },
});

router.get("/contracts", async (req, res): Promise<void> => {
  try {
    const contracts = await db
      .select()
      .from(contractsTable)
      .orderBy(desc(contractsTable.uploadedAt));
    res.json(ListContractsResponse.parse(contracts));
  } catch (err) {
    req.log.error({ err }, "Failed to list contracts");
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

router.post(
  "/contracts/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "File exceeds the 10 MB size limit" });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    // Second-pass: verify PDF magic bytes (defends against renamed non-PDFs)
    const filePath = path.join(uploadDir, file.filename);
    if (!isPdfMagic(filePath)) {
      fs.unlinkSync(filePath);
      res.status(400).json({ error: "Uploaded file is not a valid PDF" });
      return;
    }

    // Validate optional notes field
    const rawNotes = req.body.notes;
    const notes =
      typeof rawNotes === "string" && rawNotes.trim().length > 0
        ? rawNotes.trim().slice(0, 1000)
        : null;

    try {
      const [contract] = await db
        .insert(contractsTable)
        .values({
          filename: file.filename,
          originalName: file.originalname,
          sizeBytes: file.size,
          status: "pending",
          notes,
        })
        .returning();

      req.log.info({ contractId: contract.id }, "Contract uploaded");
      res.status(201).json(UploadContractResponse.parse(contract));
    } catch (err) {
      req.log.error({ err }, "Failed to save contract record");
      // Clean up orphaned file
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(500).json({ error: "Failed to save contract" });
    }
  }
);

router.get("/contracts/:id", async (req, res): Promise<void> => {
  const params = GetContractParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [contract] = await db
      .select()
      .from(contractsTable)
      .where(eq(contractsTable.id, params.data.id));

    if (!contract) {
      res.status(404).json({ error: "Contract not found" });
      return;
    }

    res.json(GetContractResponse.parse(contract));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch contract");
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

router.delete("/contracts/:id", async (req, res): Promise<void> => {
  const params = DeleteContractParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [contract] = await db
      .delete(contractsTable)
      .where(eq(contractsTable.id, params.data.id))
      .returning();

    if (!contract) {
      res.status(404).json({ error: "Contract not found" });
      return;
    }

    // Clean up file from disk (best-effort; don't fail the request if missing)
    const filePath = path.join(uploadDir, contract.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn({ fsErr, file: contract.filename }, "Could not delete contract file from disk");
      }
    }

    res.json(DeleteContractResponse.parse({ success: true }));
  } catch (err) {
    req.log.error({ err }, "Failed to delete contract");
    res.status(500).json({ error: "Failed to delete contract" });
  }
});

export default router;
