# MangoG — Document Signing Platform

A full-stack document signing application that integrates **Setu E-Sign API** for Aadhaar-based electronic signatures. Upload PDF contracts, request e-signatures, track signing status in real-time, and download signed documents — all through a secure backend proxy.

---

## Table of Contents

- [Framework Choices](#framework-choices)
- [Architecture Overview](#architecture-overview)
- [System Flow](#system-flow)
- [Setup Instructions](#setup-instructions)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
- [Deployment](#deployment)
  - [Frontend → Vercel](#frontend--vercel)
  - [Backend → Render](#backend--render)
- [Security Considerations](#security-considerations)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)

---

## Framework Choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend Framework** | **React 19** with TypeScript | Industry-standard component model, excellent ecosystem, strong typing |
| **Routing** | **wouter** | Lightweight (~2 KB) hook-based router. No heavy dependencies like react-router |
| **Styling** | **Tailwind CSS v4** | Utility-first, zero-runtime CSS. Fast iteration, consistent design |
| **Icons** | **Lucide React** | Clean, consistent SVG icon library |
| **Build Tool** | **Vite 8** | Fast HMR, native ESM, optimized builds |
| **Backend Framework** | **Express 5** | Mature, minimal, well-understood. Easy to reason about |
| **File Uploads** | **Multer** | Standard multipart/form-data middleware for Express |
| **Database** | **PostgreSQL (via Supabase)** | Relational data fits naturally. Supabase adds storage + real-time out of the box |
| **E-Sign API** | **Setu E-Sign** | Aadhaar-based e-sign compliant with Indian IT Act |
| **Runtime** | **Node.js 18+** | Required for global `fetch`, `FormData`, and `Blob` APIs |

### Why Express over alternatives?

- **Express vs Fastify**: Express has a larger ecosystem and simpler middleware model. For a project with 5 routes, the performance difference is negligible.
- **Express vs Next.js API Routes**: Keeping frontend and backend fully decoupled allows independent deployment (Vercel for frontend, Render for backend). No vendor lock-in.
- No ORM (like Prisma) was added intentionally — the Supabase JS SDK provides a clean query builder without the overhead of schema generation.

### Why Supabase over alternatives?

| Factor | Supabase | SQLite | MongoDB |
|--------|----------|--------|---------|
| **Schema** | Relational (contracts ↔ signatures) | ✅ | ❌ document model |
| **File Storage** | Built-in bucket (1 GB free) | ❌ need separate service | ❌ need separate service |
| **Persistence** | Cloud PostgreSQL | file-based | document store |
| **Scaling** | Grows with project | single-server | good but overkill |
| **Setup** | Cloud dashboard (5 min) | local only | needs Atlas/Docker |

---

## Architecture Overview

```
┌──────────────────┐       ┌───────────────────┐       ┌──────────────────┐
│                  │       │                   │       │                  │
│   Vercel (CDN)   │──────▶│   Render (Node)   │──────▶│   Setu E-Sign    │
│   React SPA      │  API  │   Express Server  │  API  │   Sandbox API    │
│   (Static)       │◀──────│   (Node 18+)      │◀──────│   (Aadhaar)      │
│                  │  JSON │                   │  JSON │                  │
└──────────────────┘       └───────┬───────────┘       └──────────────────┘
                                   │
                                   │ REST
                                   ▼
                          ┌──────────────────┐
                          │                  │
                          │   Supabase       │
                          │   PostgreSQL     │
                          │   + Storage      │
                          │                  │
                          └──────────────────┘
```

### Key Design Decisions

1. **Backend proxies all Setu calls** — The frontend never communicates with Setu directly. All API keys stay server-side.
2. **Supabase credentials use `service_role` key** — Not the anonymous key. Allows server-side row-level operations without RLS policies.
3. **Dual storage fallback** — If Supabase is not configured, the app falls back to an in-memory array. This makes local development zero-config.
4. **Setu integration falls back to mock** — If Setu credentials are missing or API calls fail, signing defaults to a mock flow. The app remains functional without Setu.
5. **Relative API URLs + VITE_API_URL** — In development, Vite proxies `/api/*` to the backend. In production, `VITE_API_URL` points to Render. No CORS issues in dev.

---

## System Flow

### Upload & Sign Sequence

```
Frontend                  Backend (Render)           Setu API              Supabase
   │                          │                        │                     │
   │  POST /api/upload        │                        │                     │
   │  (multipart PDF)         │                        │                     │
   │─────────────────────────▶│                        │                     │
   │                          │  POST /api/documents   │                     │
   │                          │  (FormData with PDF)   │                     │
   │                          │───────────────────────▶│                     │
   │                          │  { id: "doc_..." }     │                     │
   │                          │◀───────────────────────│                     │
   │                          │                        │                     │
   │                          │  POST /api/signature   │                     │
   │                          │───────────────────────▶│                     │
   │                          │  { id, signers[].url } │                     │
   │                          │◀───────────────────────│                     │
   │                          │                        │                     │
   │                          │  INSERT contract        │                     │
   │                          │────────────────────────────────────────────▶│
   │  { signatureUrl, id }    │                        │                     │
   │◀─────────────────────────│                        │                     │
   │                          │                        │                     │
   │ Open Setu signing page   │                        │                     │
   │──────────────────────────────────────────────────▶│                     │
   │                          │                        │  (Aadhaar OTP flow) │
   │                          │                        │                     │
```

### Status Polling Sequence

```
Frontend                  Backend (Render)           Setu API              Supabase
   │                          │                        │                     │
   │  GET /api/signature-status/:id                    │                     │
   │  (every 5 sec)           │                        │                     │
   │─────────────────────────▶│                        │                     │
   │                          │  GET /api/signature/:id│                     │
   │                          │───────────────────────▶│                     │
   │                          │  { status, signers }   │                     │
   │                          │◀───────────────────────│                     │
   │                          │                        │                     │
   │                          │  UPDATE status         │                     │
   │                          │────────────────────────────────────────────▶│
   │  { status: "signed" }    │                        │                     │
   │◀─────────────────────────│                        │                     │
   │                          │                        │                     │
   │  ═══ Polling STOPS ═══   │                        │                     │
```

---

## Setup Instructions

### Prerequisites

- **Node.js 18+** (required for native `fetch`, `FormData`, `Blob`)
- **npm** or **pnpm**
- **Supabase account** (free tier: [supabase.com](https://supabase.com))
- **Setu developer account** (free sandbox: [docs.setu.co](https://docs.setu.co))

### Local Development

```bash
# 1. Clone the repository
git clone <repo-url>
cd MangoG

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. Configure environment
cd ../backend
cp .env.example .env
# Edit .env with your credentials (see below)

# 5. Start both servers
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# 6. Open http://localhost:5173
```

### Environment Variables

Create `backend/.env` (see `.env.example` for template):

```env
# Setu E-Sign API (sandbox)
SETU_X_CLIENT_ID=f4fc34b8-2b5b-4ef6-b8ba-c601310e0286
SETU_X_CLIENT_SECRET=your_client_secret
SETU_X_PRODUCT_INSTANCE_ID=371b1070-4089-4d66-bc15-8aa6c3d6065c
SETU_BASE_URL=https://dg-sandbox.setu.co
SETU_REDIRECT_URL=http://localhost:5173/status

# Supabase (Settings > API in dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

> **Note:** `.env` is gitignored. For production, set these as environment variables in your hosting dashboard.

### Database Setup

1. Create a free Supabase project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor**, paste the contents of `backend/src/db/migrations/001_initial.sql`, and run it
3. Copy the **Project URL** and **service_role key** from **Settings → API**

---

## Deployment

### Frontend → Vercel

1. Connect your repo to [Vercel](https://vercel.com)
2. Set **Root Directory** to `frontend/`
3. **Build Command**: `npm run build` (auto-detected)
4. **Environment Variables** — Add:
   ```
   VITE_API_URL=https://your-app.onrender.com
   ```
5. Deploy! The `vercel.json` handles SPA routing automatically.

### Backend → Render

1. Create a [Render](https://render.com) Web Service connected to your repo
2. Set **Root Directory** to `backend/`
3. **Build Command**: `npm install`
4. **Start Command**: `npx tsx src/index.ts`
5. **Environment Variables** — Add all of these:
   ```env
   SETU_X_CLIENT_ID=...
   SETU_X_CLIENT_SECRET=...
   SETU_X_PRODUCT_INSTANCE_ID=...
   SETU_BASE_URL=https://dg-sandbox.setu.co
   SETU_REDIRECT_URL=https://your-vercel-app.vercel.app/status
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   PORT=3001
   ```
6. The `engines.node` field in `package.json` ensures Render uses Node 18+.

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| **API key exposure** | All Setu credentials stay server-side in `backend/.env`. Frontend never sees them. |
| **Signed document access** | The backend proxies all Setu downloads. Setu's time-limited S3 URLs are never exposed to the client. |
| **File validation** | Uploads are validated by MIME type (`multer` file filter) AND PDF magic byte check (`%PDF` header). |
| **File size limit** | Multer enforces a 10 MB limit before the file is fully buffered. |
| **CORS** | Backend uses `cors()` middleware allowing all origins in development. In production, restrict `origin` to your Vercel domain. |
| **Supabase access** | Backend uses the `service_role` key (full access) — never the anonymous key. This key is never exposed to the frontend. |
| **Environment isolation** | `.env` is gitignored. Production secrets are set via hosting provider's environment variable dashboard. |
| **Input sanitization** | Notes field is trimmed and capped at 1000 characters. No HTML/JS injection possible through text fields. |
| **Runtime safety** | Startup check verifies `fetch`, `FormData`, `Blob`, and `AbortSignal.timeout()` are available. Warns if on Node.js < 18. |

---

## API Reference

All routes are prefixed with `/api`.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/upload-contract` | Upload PDF, create Setu signature request |
| `GET` | `/api/signature-status/:id` | Live signature status from Setu |
| `GET` | `/api/download/:id` | Proxy-download signed PDF |
| `GET` | `/api/contracts` | List all contracts |
| `GET` | `/api/contracts/:id` | Get contract by internal ID |
| `GET` | `/api/documents/:docId/signature` | Signature info by document ID |
| `POST` | `/api/documents/:docId/sign` | Mock-sign a document |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/test-setu` | Setu connectivity diagnostic |

---

## Project Structure

```
MangoG/
├── backend/
│   ├── src/
│   │   ├── app.ts                  # Express app setup, CORS, error handler
│   │   ├── index.ts                # Entry point, runtime checks, startup
│   │   ├── routes/
│   │   │   └── contracts.ts        # All API routes + storage adapters
│   │   ├── services/
│   │   │   ├── setu.ts             # Setu API client (upload, sign, status, download)
│   │   │   └── supabase.ts         # Supabase DB + Storage helpers
│   │   └── db/
│   │       └── migrations/
│   │           └── 001_initial.sql # Contracts table schema
│   ├── uploads/contracts/          # Local file storage (gitignored)
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Wouter router setup
│   │   ├── main.tsx                # React entry point
│   │   ├── index.css               # Tailwind + global styles
│   │   ├── lib/
│   │   │   ├── api.ts              # API client (VITE_API_URL base)
│   │   │   └── utils.ts            # cn() helper, formatBytes()
│   │   └── components/
│   │       ├── landing-page.tsx    # Hero, quick actions, recent activity
│   │       ├── upload-contract.tsx # Drag-drop PDF upload, signing options
│   │       ├── status-page.tsx     # Signature lookup, live polling, download
│   │       ├── sign-document.tsx   # Mock signing page
│   │       ├── nav-header.tsx      # Navigation bar
│   │       └── ui/                 # Reusable UI primitives
│   │           ├── button.tsx
│   │           ├── card.tsx
│   │           └── progress.tsx
│   ├── vercel.json                 # SPA routing config
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── README.md                       # This file
├── DESIGN.md                       # Architecture diagrams & design doc
└── .gitignore
```
