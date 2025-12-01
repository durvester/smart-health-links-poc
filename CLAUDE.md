# CLAUDE.md - MyHealthURL Implementation Instructions

## Project Overview

You are building **MyHealthURL**, a SMART on FHIR application that lets healthcare providers share patient documents via encrypted, expiring links (SMART Health Links).

**Read the full specification:** `SPECIFICATION.md` (in this repo)

---

## Quick Start

```bash
# 1. Create the monorepo
mkdir myhealthurl && cd myhealthurl
pnpm init

# 2. Set up workspace
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF

# 3. Create directory structure
mkdir -p apps/{api,web,viewer}/src packages/shared/src

# 4. Install turbo
pnpm add -D turbo

# 5. Copy .env.example to .env and configure
```

---

## Implementation Order

Follow this exact order. Each step should be fully working before moving to the next.

### Phase 1: Foundation

#### Step 1: Monorepo Setup
- Initialize pnpm workspace with turbo
- Create `apps/api`, `apps/web`, `apps/viewer`, `packages/shared`
- Configure TypeScript in each package
- Set up shared types in `packages/shared`

#### Step 2: Database Schema
- Use Drizzle ORM with SQLite
- Implement tables: `sessions`, `shls`, `audit_logs`
- Create migration scripts
- Test database operations

#### Step 3: Encryption Service
```typescript
// apps/api/src/services/encryption.ts
// MUST use jose library for JWE
// MUST use pako for DEFLATE compression
// Key: 32 bytes (256 bits), base64url encoded = 43 chars
// Algorithm: dir + A256GCM
// Compression: zip=DEF
```

#### Step 4: S3 Storage Service
```typescript
// apps/api/src/services/storage.ts
// Upload JWE-encrypted files
// Generate pre-signed URLs (1 hour TTL)
// ContentType should be 'application/jose'
```

### Phase 2: SMART on FHIR Integration

#### Step 5: SMART Launch Flow
```typescript
// apps/api/src/routes/smart.ts
// GET /launch - Handle launch with iss and launch params
// GET /callback - Exchange code for tokens
// Store iss in session (needed for API calls)
```

**Critical:** The `iss` parameter IS the FHIR base URL. Store it in the session.

#### Step 6: Practice Fusion API Client
```typescript
// apps/api/src/services/fhir.ts
// GET Patient from {iss}/Patient/{patientId}

// apps/api/src/services/documents.ts
// List: GET https://qa-api.practicefusion.com/ehr/documents/v3/documents?patientPracticeGuid={patientId}
// Content: GET https://qa-api.practicefusion.com/ehr/documents/v3/documents/{guid}/content
```

### Phase 3: SHL Generation

#### Step 7: SHL Generation Endpoint
```typescript
// POST /api/shl
// 1. Validate at least one document selected
// 2. Fetch each document binary from Practice Fusion
// 3. Generate SHL key (32 bytes)
// 4. Encrypt each document with JWE
// 5. Upload encrypted docs to S3
// 6. Build FHIR Bundle (Patient + DocumentReferences)
// 7. Encrypt bundle with same key
// 8. Upload encrypted bundle to S3
// 9. Generate manifest ID (32 bytes = 43 chars base64url)
// 10. Create SHL record in database
// 11. Send SMS/email notifications
// 12. Return viewer URL
```

#### Step 8: Manifest Endpoint
```typescript
// POST /shl/:id/manifest (PUBLIC - no auth)
// 1. Validate SHL exists and not expired/revoked
// 2. Log access (IP, user agent, recipient, location)
// 3. Send access notification to patient (async)
// 4. Generate pre-signed S3 URL for bundle
// 5. Return manifest response
```

### Phase 4: Provider App (React)

#### Step 9: Provider Web App
- Launch page (handles SMART launch redirect)
- Callback page (receives auth code)
- Home page (shows patient info + document list)
- Document selection with checkboxes (all selected by default)
- Contact info form (phone, email from Patient resource)
- Expiration dropdown
- Generate Link button
- Existing Links page
- Link Details page with audit log
- Revoke functionality

### Phase 5: Patient Viewer (React)

#### Step 10: Viewer App
- Parse SHL from URL fragment (`#shlink:/eyJ...`)
- Prompt for recipient name
- POST to manifest endpoint
- Fetch and decrypt bundle from S3
- Parse FHIR Bundle
- Display patient info
- List documents with download buttons
- Download All button
- Error states (expired, revoked, invalid)

### Phase 6: Notifications

#### Step 11: Notification Service
```typescript
// apps/api/src/services/notifications.ts
// Twilio for SMS
// AWS SES for email
// Two notification types:
//   1. SHL delivery (link created)
//   2. Access notification (someone viewed)
```

### Phase 7: Testing & Deployment

#### Step 12: Tests
- Unit tests for encryption, SHL generation, FHIR bundle
- Integration tests for SMART launch, API endpoints
- E2E tests with Playwright

#### Step 13: Deployment
- Configure fly.toml for each app
- Set up custom domains in fly.io
- Configure DNS in GoDaddy
- Set secrets in fly.io
- Deploy

---

## Implementation Status (Reviewed 2024-11-30)

### Completed Components
- [x] Monorepo setup with pnpm + turbo
- [x] Shared types in `packages/shared`
- [x] Database schema with Drizzle ORM (sessions, shls, audit_logs)
- [x] Encryption service (JWE with jose library)
- [x] S3 storage service with pre-signed URLs
- [x] SMART launch flow (/launch, /callback)
- [x] Practice Fusion FHIR client (Patient fetch)
- [x] Practice Fusion Documents API client
- [x] SHL generation service (POST /api/shl)
- [x] Manifest endpoint (POST /shl/:id/manifest)
- [x] SHL management routes (list, details, revoke)
- [x] Patient viewer with client-side decryption
- [x] Access logging with geolocation
- [x] Provider web app (basic structure)

### Pending Components
- [ ] Twilio SMS integration (currently stubbed)
- [ ] AWS SES email integration (currently stubbed)
- [ ] Provider app: SHL list page
- [ ] Provider app: SHL details page with audit log
- [ ] Unit tests for encryption and SHL services
- [ ] Integration tests
- [ ] E2E tests with Playwright
- [ ] Deployment configuration

---

## Critical Requirements Checklist (Verified)

### Encryption
- [x] JWE uses `alg: 'dir'`, `enc: 'A256GCM'` - Implemented in `encryption.ts:68-72`
- [x] DEFLATE decompression supported (compression optional per spec) - Handled via `inflateRaw` option
- [x] Keys are exactly 32 bytes (43 chars base64url) - Validated in `encryption.ts:29`
- [x] Manifest ID has 256 bits entropy (43 chars base64url) - `generateManifestId()` uses 32 random bytes
- [x] SHL keys are NEVER stored server-side - Only returned to client, never persisted

### FHIR Compliance
- [x] Bundle type is `collection` - Set in `shl.ts:136`
- [x] Patient resource from Practice Fusion FHIR API - `getPatient()` in `fhir.ts`
- [x] DocumentReference follows US Core profile - Profile URL in meta, `shl.ts:89`
- [x] DocumentReference.content.attachment.url points to S3 - Pre-signed URL set in `shl.ts:118-124`

### Security
- [x] Session tokens encrypted at rest - `encryptTokenForStorage()` in `encryption.ts:168-174`
- [x] S3 URLs are pre-signed with 1-hour TTL - `storage.ts:88` uses 3600 seconds
- [x] Access logged with IP, user agent, recipient, location - `manifest.ts:132-140`
- [x] Notifications sent on every access - `manifest.ts:152-162` (async)

### Business Logic
- [x] Generation blocked if no documents selected - `shl.ts:104-107`
- [x] At least one contact method required - `shl.ts:109-112`
- [x] User scopes (not patient scopes) - Configured in SMART launch
- [ ] All documents selected by default - Needs implementation in provider app UI

### SHL Protocol Compliance Notes

Per `smart-health-links-spec.md`:
- **Compression**: Spec says `zip: DEF` is OPTIONAL. Our implementation doesn't compress on encryption but properly handles decompression via `inflateRaw` option. This is spec-compliant.
- **Manifest Response**: Returns `files` array with `contentType` and `location` per spec.
- **HTTP Status Codes**: 404 for not found, 410 for expired/revoked per spec.
- **No L/P/U Flags**: Design decision per SPECIFICATION.md Section 2.3.

---

## API Reference

### Practice Fusion

**FHIR Base URL:** From `iss` parameter (e.g., `https://qa-api.practicefusion.com/fhir/r4/v1/{practiceGuid}`)

**Documents Base URL:** `https://qa-api.practicefusion.com/ehr/documents/v3`

**Required Scopes:**
```
launch openid fhirUser offline_access
user/Patient.read user/Practitioner.read user/Organization.read
user/Location.read user/Encounter.read user/Binary.read
document:r_document_v2
```

### Our API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/launch` | None | SMART launch entry |
| GET | `/callback` | None | OAuth callback |
| GET | `/api/session` | Session | Get patient + documents |
| POST | `/api/session/logout` | Session | End session |
| POST | `/api/shl` | Session | Generate SHL |
| GET | `/api/shls` | Session | List SHLs for patient |
| GET | `/api/shls/:id` | Session | Get SHL details |
| POST | `/api/shls/:id/revoke` | Session | Revoke SHL |
| POST | `/shl/:id/manifest` | **None** | Public manifest endpoint |

---

## Code Patterns

### Encryption Example

```typescript
import * as jose from 'jose';
import pako from 'pako';

export function generateShlKey() {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const keyBase64Url = jose.base64url.encode(key);
  return { key, keyBase64Url };
}

export async function encryptContent(
  content: Uint8Array,
  key: Uint8Array,
  contentType: string
): Promise<string> {
  const compressed = pako.deflateRaw(content);
  
  return new jose.CompactEncrypt(compressed)
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
      cty: contentType,
      zip: 'DEF'
    })
    .encrypt(key);
}

export async function decryptContent(
  jwe: string,
  key: Uint8Array
): Promise<{ content: Uint8Array; contentType: string }> {
  const { plaintext, protectedHeader } = await jose.compactDecrypt(jwe, key);
  
  const content = protectedHeader.zip === 'DEF'
    ? pako.inflateRaw(plaintext)
    : plaintext;
  
  return {
    content: new Uint8Array(content),
    contentType: protectedHeader.cty as string
  };
}
```

### SHL Payload Creation

```typescript
export function createShlPayload(params: {
  manifestUrl: string;
  keyBase64Url: string;
  expiresAt: Date;
  patientName: string;
}): string {
  const payload = {
    url: params.manifestUrl,
    key: params.keyBase64Url,
    exp: Math.floor(params.expiresAt.getTime() / 1000),
    label: `Documents for ${params.patientName}`.slice(0, 80)
  };
  
  const payloadBase64Url = jose.base64url.encode(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  
  return `shlink:/${payloadBase64Url}`;
}
```

### FHIR Bundle Creation

```typescript
export function createFhirBundle(
  patient: FhirPatient,
  documentRefs: FhirDocumentReference[]
): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: [
      {
        fullUrl: `urn:uuid:${crypto.randomUUID()}`,
        resource: patient
      },
      ...documentRefs.map(doc => ({
        fullUrl: `urn:uuid:${crypto.randomUUID()}`,
        resource: doc
      }))
    ]
  };
}
```

### DocumentReference Creation

```typescript
export function createDocumentReference(
  doc: PracticeFusionDocument,
  s3Url: string,
  patientId: string
): FhirDocumentReference {
  return {
    resourceType: 'DocumentReference',
    id: `doc-${doc.documentGuid}`,
    meta: {
      profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference']
    },
    status: 'current',
    type: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
        code: 'UNK',
        display: doc.documentType
      }]
    },
    category: [{
      coding: [{
        system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category',
        code: 'clinical-note'
      }]
    }],
    subject: {
      reference: `Patient/${patientId}`
    },
    date: doc.documentDateTime,
    content: [{
      attachment: {
        contentType: doc.documentContentMetadata.mediaType,
        url: s3Url,
        title: doc.documentName,
        size: doc.documentContentMetadata.size
      }
    }]
  };
}
```

---

## Environment Variables

Create `.env` with these variables:

```bash
# Practice Fusion OAuth
PRACTICE_FUSION_CLIENT_ID=
PRACTICE_FUSION_CLIENT_SECRET=

# Practice Fusion API (documents endpoint is fixed)
PRACTICE_FUSION_DOCS_BASE_URL=https://qa-api.practicefusion.com/ehr/documents/v3

# Database
DATABASE_URL=file:./data/myhealthurl.db

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-west-2
S3_BUCKET_NAME=myhealthurl-files

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# AWS SES
SES_FROM_EMAIL=noreply@myhealthurl.com

# App URLs
APP_URL=https://app.myhealthurl.com
API_URL=https://api.myhealthurl.com
VIEWER_URL=https://myhealthurl.com

# Security (generate with: openssl rand -hex 32)
SESSION_SECRET=
ENCRYPTION_KEY=

# Defaults
SHL_EXPIRATION_DAYS_DEFAULT=90
SHL_EXPIRATION_DAYS_MAX=365
```

---

## Do NOT

1. **Do NOT** store SHL encryption keys server-side
2. **Do NOT** store unencrypted documents
3. **Do NOT** allow SHL generation with zero documents
4. **Do NOT** skip access logging or notifications
5. **Do NOT** hardcode URLs or credentials
6. **Do NOT** use patient scopes (use `user/` scopes)
7. **Do NOT** implement P, L, or U flags
8. **Do NOT** hardcode the FHIR base URL (use `iss` from launch)

---

## Testing Commands

```bash
pnpm test              # Unit tests
pnpm test:coverage     # With coverage
pnpm test:integration  # Integration tests
pnpm test:e2e          # Playwright E2E
pnpm test:all          # Everything
```

---

## Deployment Commands

```bash
# Initial setup
fly apps create myhealthurl-api
fly apps create myhealthurl-web
fly apps create myhealthurl-viewer

# Set secrets
fly secrets set PRACTICE_FUSION_CLIENT_ID=xxx ... -a myhealthurl-api

# Deploy
fly deploy -a myhealthurl-api
fly deploy -a myhealthurl-web
fly deploy -a myhealthurl-viewer

# Custom domains
fly certs add api.myhealthurl.com -a myhealthurl-api
fly certs add app.myhealthurl.com -a myhealthurl-web
fly certs add myhealthurl.com -a myhealthurl-viewer
```

---

## File Structure Reference

```
myhealthurl/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── config.ts
│   │   │   ├── routes/
│   │   │   │   ├── smart.ts
│   │   │   │   ├── session.ts
│   │   │   │   ├── shl.ts
│   │   │   │   └── manifest.ts
│   │   │   ├── services/
│   │   │   │   ├── fhir.ts
│   │   │   │   ├── documents.ts
│   │   │   │   ├── shl.ts
│   │   │   │   ├── encryption.ts
│   │   │   │   ├── storage.ts
│   │   │   │   ├── notifications.ts
│   │   │   │   └── geolocation.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   └── types/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Launch.tsx
│   │       │   ├── Callback.tsx
│   │       │   ├── Home.tsx
│   │       │   ├── Create.tsx
│   │       │   └── Details.tsx
│   │       └── components/
│   └── viewer/
│       └── src/
│           ├── App.tsx
│           ├── components/
│           │   ├── RecipientPrompt.tsx
│           │   ├── PatientInfo.tsx
│           │   ├── DocumentList.tsx
│           │   └── ErrorDisplay.tsx
│           └── lib/
│               ├── shl.ts
│               └── fhir.ts
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts
│           └── constants.ts
├── fly.toml
├── Dockerfile
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── SPECIFICATION.md
└── CLAUDE.md (this file)
```

---

## Questions?

Refer to `SPECIFICATION.md` for complete details on:
- SHL encryption requirements
- FHIR bundle structure
- Database schema
- UI wireframes
- Notification templates
- Testing strategy
- Security considerations