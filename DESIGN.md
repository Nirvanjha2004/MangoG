# MangoG — Design Document

> A full-stack document signing platform integrating Setu E-Sign API for Aadhaar-based electronic signatures.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Component Design](#2-component-design)
3. [Sequence Diagrams](#3-sequence-diagrams)
4. [Data Model](#4-data-model)
5. [Design Decisions & Trade-offs](#5-design-decisions--trade-offs)
6. [Future Improvements](#6-future-improvements)

---

## 1. System Architecture

### High-Level Diagram

```mermaid
flowchart TB
    subgraph Client["🌐 Client Layer"]
        Browser["🖥️ Browser (React SPA)"]
    end

    subgraph CDN["📡 CDN & Hosting"]
        Vercel["▲ Vercel\n- Static file serving\n- SPA rewrites\n- Build-time env injection"]
    end

    subgraph Server["⚙️ Server Layer (Render)"]
        Express["🟢 Express 5 Server\n- Routes\n- CORS\n- Error handling"]
        SetuService["🔗 Setu API Client\n- uploadDocument()\n- createSignatureRequest()\n- getSignatureStatus()\n- downloadSignedDocument()"]
        SupabaseService["🗄️ Supabase Client\n- CRUD operations\n- Storage upload/download"]
        MemoryStore["💾 In-Memory Fallback\n- Memory array\n- Dev-only"]
    end

    subgraph External["🔌 External Services"]
        SetuAPI["🏛️ Setu E-Sign API\nPOST /api/documents\nPOST /api/signature\nGET /api/signature/:id\nGET /api/signature/:id/download/"]
        Supabase["☁️ Supabase Cloud\nPostgreSQL DB\nObject Storage"]
    end

    Browser -->|"HTTP requests\n(static assets)"| Vercel
    Vercel -->|"API calls via VITE_API_URL"| Express
    
    Express -->|"FormData upload"| SetuService
    Express -->|"JSON queries"| SupabaseService
    Express -->|"Fallback"| MemoryStore
    
    SetuService -->|"REST API\n(auth headers)"| SetuAPI
    SupabaseService -->|"SQL queries\nREST API"| Supabase
    
    style Client fill:#f0f4ff,stroke:#4f7dff
    style Server fill:#f0fff4,stroke:#38a169
    style External fill:#fff5f0,stroke:#dd6b20
```

### Layer Responsibilities

| Layer | Responsibility | Resilience |
|-------|---------------|------------|
| **React SPA** | UI rendering, user interactions, file upload | Offline-capable for non-API features |
| **Express Backend** | API routing, file validation, business logic | Graceful degradation (mock → memory → Supabase) |
| **Setu API Client** | E-sign operations, credential management | Falls back to mock signature on any failure |
| **Supabase Client** | Data persistence, file storage | Falls back to in-memory array |
| **In-Memory Store** | Zero-config dev storage | Data lost on restart |

---

## 2. Component Design

### Frontend Component Tree

```mermaid
flowchart TB
    App["App.tsx\n<WouterRouter>"]
    Landing["landing-page.tsx\n🏠 Landing Page\n- Hero section\n- Quick actions\n- Recent activity"]
    Upload["upload-contract.tsx\n📤 Upload Page\n- Drag/drop zone\n- Progress bar\n- Signing options\n- Tab/iframe toggle"]
    Status["status-page.tsx\n🔍 Status Page\n- Signature lookup\n- Live polling\n- Download"]
    Sign["sign-document.tsx\n✍️ Signing Page\n- Document preview\n- Mock signature\n- Signed confirmation"]
    
    UI_Button["ui/button.tsx"]
    UI_Card["ui/card.tsx"]
    UI_Progress["ui/progress.tsx"]
    Nav["nav-header.tsx"]
    
    Lib_Api["lib/api.ts\nAPI client\n(VITE_API_URL)"]
    Lib_Utils["lib/utils.ts\ncn(), formatBytes()"]
    
    App -->|"/"| Landing
    App -->|"/upload"| Upload
    App -->|"/status"| Status
    App -->|"/sign/:documentId"| Sign
    
    Landing --> Nav
    Upload --> Nav
    Status --> Nav
    Sign --> Nav
    
    Upload --> UI_Button
    Upload --> UI_Card
    Upload --> UI_Progress
    Status --> UI_Button
    Status --> UI_Card
    Sign --> UI_Button
    Sign --> UI_Card
    
    Status --> Lib_Api
    Upload --> Lib_Api
    Sign --> Lib_Api
    Landing --> Lib_Api
    
    Status --> Lib_Utils
    Upload --> Lib_Utils
    Sign --> Lib_Utils
    Landing --> Lib_Utils
```

### Backend Module Structure

```mermaid
flowchart TB
    Index["index.ts\n🏁 Entry Point\n- Runtime check\n- Supabase setup\n- Server start"]
    App["app.ts\n⚙️ Express Config\n- CORS\n- JSON parsing\n- Error handler"]
    
    subgraph Routes["📡 Routes (contracts.ts)"]
        UploadRoute["POST /api/upload-contract"]
        StatusRoute["GET /api/signature-status/:id"]
        DownloadRoute["GET /api/download/:id"]
        ListRoute["GET /api/contracts"]
        TestRoute["GET /api/test-setu"]
        LegacyRoutes["Legacy routes\n(for backward compat)"]
    end
    
    subgraph Services["🔧 Services"]
        SetuService["setu.ts\nSetu API Client"]
        SupabaseService["supabase.ts\nSupabase Client"]
    end
    
    subgraph Storage["💾 Storage Adapters"]
        SupabaseStore["Supabase CRUD"]
        MemoryStore["In-Memory Array"]
    end
    
    Index --> App
    App --> Routes
    Routes --> SetuService
    Routes --> Storage
    
    Storage --> SupabaseStore
    Storage --> MemoryStore
    
    SupabaseStore --> SupabaseService
```

---

## 3. Sequence Diagrams

### Upload & Create Signature Request

```mermaid
sequenceDiagram
    actor User
    participant Frontend as React SPA
    participant Backend as Express Server
    participant Setu as Setu API
    participant DB as Supabase
    
    User->>Frontend: Select PDF & click Upload
    Frontend->>Frontend: Validate file type & size
    
    Frontend->>Backend: POST /api/upload-contract (FormData)
    Note over Backend: multer saves file to disk
    
    Backend->>Backend: Verify PDF magic bytes (%PDF)
    
    alt Setu configured
        Backend->>Setu: POST /api/documents (FormData)
        Setu-->>Backend: 201 { id: "doc_uuid" }
        
        Backend->>Setu: POST /api/signature (JSON)
        Note over Backend: redirectUrl, signers[], signature config
        Setu-->>Backend: 201 { id, signers[{url}] }
        
        Backend->>Backend: Extract signer URL
        Backend->>DB: INSERT contract (with setu_document_id)
        DB-->>Backend: OK
        
        Frontend-->>Frontend: Show "Open Signing Page" button
    else Setu failed / not configured
        Backend->>Backend: Generate mock signature ID & URL
        Backend->>DB: INSERT contract (without setu_document_id)
        
        Frontend-->>Frontend: Show mock signing page link
    end
    
    Backend-->>Frontend: 201 { signatureUrl, signatureId, status }
    
    Note over User,Frontend: Upload complete
```

### Signature Status Polling

```mermaid
sequenceDiagram
    actor User
    participant Frontend as React SPA
    participant Backend as Express Server
    participant Setu as Setu API
    participant DB as Supabase
    
    User->>Frontend: Enter Signature ID & click Search
    Frontend->>Backend: GET /api/signature-status/:id
    Backend->>DB: SELECT contract by signature_id
    
    alt Has setu_document_id (real Setu signature)
        Backend->>Setu: GET /api/signature/:id
        Setu-->>Backend: { status: "sign_initiated" | "sign_pending" | "sign_in_progress" | "sign_complete" }
        
        Backend->>Backend: mapSetuStatus()
        Backend->>DB: UPDATE signature_status, signature_signed_at
        Backend-->>Frontend: { status: "pending" }
        
        Note over Frontend,Backend: ═══ POLLING LOOP (every 5s) ═══
        loop Every 5 seconds until status != "pending"
            Frontend->>Backend: GET /api/signature-status/:id
            Backend->>Setu: GET /api/signature/:id
            Setu-->>Backend: { status: "sign_complete", updatedAt: "..." }
            Backend->>DB: UPDATE status = "signed"
            Backend-->>Frontend: { status: "signed", signedAt: "..." }
            Frontend->>Frontend: Stop polling, show download button
        end
    else Mock or cached
        Backend-->>Frontend: { status: cached_status }
    end
```

### Signed Document Download

```mermaid
sequenceDiagram
    actor User
    participant Frontend as React SPA
    participant Backend as Express Server
    participant Setu as Setu API
    
    User->>Frontend: Click "Download Signed Document"
    Frontend->>Backend: GET /api/download/:signatureId
    
    Backend->>DB: SELECT contract by signature_id
    Note over Backend: Verify status == "signed"
    
    alt Setu signature
        Backend->>Setu: GET /api/signature/:id/download/
        Setu-->>Backend: { downloadUrl: "https://s3...", validUpto: "..." }
        Backend->>Setu: GET downloadUrl (proxy)
        Setu-->>Backend: Binary PDF stream
        Backend-->>Frontend: PDF buffer (Content-Disposition: attachment)
    else Mock signature
        Backend->>Supabase: Download from Storage
        alt Supabase has file
            Supabase-->>Backend: PDF buffer
        else Local file
            Backend->>Backend: Read from uploads/contracts/
        end
        Backend-->>Frontend: PDF buffer
    end
    
    Frontend->>Frontend: Create blob URL, trigger download
    User->>User: Save signed PDF
```

---

## 4. Data Model

### PostgreSQL Schema (`contracts` table)

```sql
CREATE TABLE contracts (
  id                BIGSERIAL PRIMARY KEY,
  document_id       TEXT UNIQUE NOT NULL,     -- Our internal doc ID (doc_xxx)
  filename          TEXT NOT NULL,            -- File on disk / storage path
  original_name     TEXT NOT NULL,            -- User's original filename
  size_bytes        BIGINT NOT NULL,          -- File size in bytes
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processed', 'failed')),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes             TEXT,                     -- Optional user notes
  signature_id      TEXT UNIQUE NOT NULL,      -- Setu or mock signature ID
  signature_url     TEXT NOT NULL,             -- Setu signing URL or mock URL
  signature_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (signature_status IN ('pending', 'signed', 'expired')),
  signature_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_signed_at   TIMESTAMPTZ,          -- Null until signed
  setu_document_id  TEXT,                     -- Setu's document ID (null for mock)
  storage_file_path TEXT                      -- Supabase storage path
);

-- Indexes for common lookups
CREATE INDEX idx_contracts_signature_id ON contracts(signature_id);
CREATE INDEX idx_contracts_document_id  ON contracts(document_id);
CREATE INDEX idx_contracts_uploaded_at  ON contracts(uploaded_at DESC);
```

### Application Model (TypeScript)

```typescript
interface Contract {
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
```

---

## 5. Design Decisions & Trade-offs

### Decision 1: Backend Proxy Pattern

**Choice:** All Setu API calls go through the Express backend. The frontend never calls Setu directly.

**Rationale:**
- API credentials stay server-side (in `.env` or Render env vars)
- Setu's time-limited signed document URLs are never exposed to the client
- A single place to add caching, retries, logging, and error handling
- Consistent CORS policy (only the backend needs CORS, not Setu)

**Trade-off:** Adds latency (every status check goes: Frontend → Backend → Setu → Backend → Frontend). Mitigated by lightweight JSON responses.

### Decision 2: Polling over Webhooks

**Choice:** Frontend polls the backend every 5 seconds to check signature status.

**Rationale:**
- Setu's sandbox API does not provide webhooks
- Polling is simpler to implement and debug
- No infrastructure needed (no webhook endpoint, no event queue)
- 5-second interval balances responsiveness with API usage

**Trade-off:** Higher API usage (12 requests/minute per pending signature). Acceptable for sandbox and low-volume use.

**Future Improvement:** Add a webhook endpoint (`POST /api/setu-webhook`) when Setu's production API supports it. Until then, polling works.

### Decision 3: Dual Storage Pattern

**Choice:** Try Supabase first, fall back to in-memory array on failure.

**Rationale:**
- Zero-config local development (no Docker, no Supabase needed)
- Graceful degradation in production (if Supabase is down, the app still works)
- Each operation tries Supabase → catches error → falls back to memory

**Trade-off:** Data inconsistency if Supabase partially fails (some data in Supabase, some in memory). Mitigated by logging all failures clearly.

### Decision 4: Mock Signature Fallback

**Choice:** When Setu API fails or credentials are missing, generate mock signatures locally.

**Rationale:**
- The app is fully functional without Setu — great for development, demo, and testing
- Mock signatures can be created, checked, and "signed" (status toggled)
- Clean separation: Setu integration is a pluggable module

**Trade-off:** Mock signatures have no legal validity. The frontend clearly distinguishes mock vs real Setu flows via `setuConfigured` flag in the response.

### Decision 5: No ORM

**Choice:** Use the Supabase JS SDK directly instead of Prisma / Drizzle.

**Rationale:**
- The data model has a single table (contracts) — an ORM adds complexity without benefit
- Supabase SDK provides type-safe queries out of the box
- Raw SQL migration is simpler to version and review
- No schema generation step in the build pipeline

**Trade-off:** Schema changes must be manually written as SQL migrations. Acceptable for a single-table schema.

### Decision 6: Inline Route Handlers

**Choice:** All route handlers in a single `contracts.ts` file with storage adapter functions.

**Rationale:** For 10 routes with shared storage logic, a single file is more readable than splitting into 5 files. Storage adapters are small functions at the top of the file, not a separate service layer.

**Trade-off:** If the app grows beyond 20 routes, this should be split into `/routes/contracts.ts`, `/routes/signatures.ts`, and `/storage/adapters.ts`.

---

## 6. Future Improvements

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| Setu webhook endpoint | Medium | Small | `POST /api/setu-webhook` for instant status updates |
| Supabase Realtime subscriptions | Medium | Medium | Push-based status updates instead of polling |
| Multi-signer support | High | Medium | Allow multiple signers per document |
| Email notifications | Medium | Medium | Integrate SendGrid / Resend for signing links |
| PDF preview in browser | Medium | Large | PDF.js rendering instead of placeholder |
| Rate limiting on upload | Low | Small | Prevent abuse of the upload endpoint |
| Unit tests for Setu client | High | Medium | Jest tests with mocked fetch |
| E2E tests | Medium | Large | Playwright tests for full upload → sign → download flow |
| Audit logging | Medium | Small | Log all signature events with timestamps |
| Docker setup | Low | Small | docker-compose for one-command local setup |

---

*Document generated for MangoG internship submission.*
