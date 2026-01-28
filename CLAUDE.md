# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MyHealthURL** is a SMART on FHIR application that lets healthcare providers share patient documents via encrypted, expiring links (SMART Health Links). Providers launch from Practice Fusion EHR, select documents, and generate secure links patients can access without logging in.

**Full specification:** `SPECIFICATION.md`

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Start all services (API:3000, Web:5173, Viewer:5174)
pnpm dev

# Build all apps
pnpm build

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run a specific test file
pnpm --filter api test src/services/encryption.test.ts

# Type checking
pnpm typecheck

# Lint
pnpm lint

# Database operations (API only)
pnpm db:migrate           # Run migrations
pnpm db:studio            # Open Drizzle Studio visual editor
pnpm --filter api db:generate  # Generate new migration
```

## Architecture

### Monorepo Structure

```
apps/
  api/        # Fastify backend (Node.js/TypeScript) - port 3000
  web/        # Provider app (React/Vite) - port 5173
  viewer/     # Patient document viewer (React/Vite) - port 5174
packages/
  shared/     # Shared types and constants
```

### Data Flow

1. **SMART Launch**: Practice Fusion redirects to `/launch` with `iss` (FHIR base URL) and `launch` params
2. **OAuth Callback**: `/callback` exchanges code for tokens, stores encrypted session in SQLite
3. **Document Fetch**: Provider app calls Practice Fusion Documents API (not FHIR) for document list
4. **SHL Generation**: API encrypts documents with JWE, uploads to S3, creates manifest ID
5. **Patient Access**: Viewer parses `#shlink:/` URL fragment, fetches manifest, decrypts client-side

### Key Services (apps/api/src/services/)

| Service | Purpose |
|---------|---------|
| `encryption.ts` | JWE encryption (jose + pako), key generation, token storage encryption |
| `storage.ts` | S3 upload/download, pre-signed URLs (1-hour TTL) |
| `documents.ts` | Practice Fusion Documents API client (list and content) |
| `fhir.ts` | Practice Fusion FHIR API client (Patient resource only) |
| `shl.ts` | SHL generation: orchestrates encryption, S3 upload, FHIR bundle creation |
| `notifications.ts` | SMS (Twilio) and email (SES) - currently stubbed |
| `geolocation.ts` | IP-to-location lookup for access logging |

### Database (SQLite + Drizzle ORM)

Tables in `apps/api/src/db/schema.ts`:
- **sessions**: OAuth sessions with encrypted tokens, links to `iss` (FHIR server)
- **shls**: SHL metadata (manifest ID, S3 references, status, expiration)
- **audit_logs**: Access logging (IP, user agent, recipient, location, event type)

### API Routes (apps/api/src/routes/)

| Route | Auth | Purpose |
|-------|------|---------|
| `smart.ts` | None | `/launch`, `/callback` - SMART on FHIR OAuth |
| `session.ts` | Session | `/api/session` - Get patient + documents |
| `shl.ts` | Session | `/api/shl`, `/api/shls` - Generate and manage SHLs |
| `manifest.ts` | **None** | `/shl/:id/manifest` - Public endpoint for viewers |

## Critical Requirements

### Encryption (JWE)
- Algorithm: `alg: 'dir'`, `enc: 'A256GCM'`
- Compression: `zip: 'DEF'` (DEFLATE via pako)
- Keys: 32 bytes (43 chars base64url encoded)
- **SHL keys are NEVER stored server-side** - only returned to client in URL

### FHIR Compliance
- Bundle type must be `collection`
- DocumentReference follows US Core profile
- Patient resource comes from Practice Fusion FHIR API
- FHIR base URL comes from `iss` parameter (never hardcode)

### Practice Fusion APIs
- **FHIR**: `{iss}/Patient/{patientId}` - Patient resource only
- **Documents**: `https://qa-api.practicefusion.com/ehr/documents/v3` - List and content
- Use `user/` scopes, not `patient/` scopes

## Do NOT

1. Store SHL encryption keys server-side
2. Store unencrypted documents
3. Allow SHL generation with zero documents
4. Hardcode FHIR base URLs (use `iss` from launch)
5. Use patient scopes (use `user/` scopes)
6. Implement P, L, or U flags (design decision)

## Testing

Tests use Vitest. Currently one test file exists: `apps/api/src/services/encryption.test.ts`

```bash
# Run all tests
pnpm test

# Run specific test with filter
pnpm --filter api test src/services/encryption.test.ts

# Watch mode
pnpm --filter api test:watch

# Coverage
pnpm test:coverage
```

## Deployment

Deployed to fly.io with GitHub Actions CI/CD on push to main:
- `myhealthurl-api` - API with SQLite volume at `/app/data`
- `myhealthurl-web` - Provider app (nginx static)
- `myhealthurl-viewer` - Patient viewer (nginx static)

```bash
# Manual deploy
fly deploy -a myhealthurl-api
fly deploy -a myhealthurl-web
fly deploy -a myhealthurl-viewer

# View logs
fly logs -a myhealthurl-api
```

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `PRACTICE_FUSION_CLIENT_ID` | Yes | OAuth client ID |
| `PRACTICE_FUSION_CLIENT_SECRET` | Yes | OAuth client secret |
| `AWS_ACCESS_KEY_ID` | Yes | S3 access |
| `AWS_SECRET_ACCESS_KEY` | Yes | S3 access |
| `S3_BUCKET_NAME` | Yes | Document storage bucket |
| `SESSION_SECRET` | Yes | Cookie signing |
| `ENCRYPTION_KEY` | Yes | Token encryption at rest |
| `VIEWER_URL` | Yes | Base URL for SHL viewer |
| `API_URL` | Yes | Base URL for API |
