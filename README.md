# MyHealthURL

A SMART on FHIR application that enables healthcare providers to share patient documents via secure, expiring links (SMART Health Links).

## Overview

MyHealthURL solves a common patient frustration: accessing medical documents typically requires navigating complex patient portals with forgotten passwords. Instead, providers can generate secure, expiring links that patients access with a single click.

### How It Works

1. Provider launches the app from Practice Fusion EHR in the context of a patient
2. Provider sees a list of the patient's documents with checkboxes (all selected by default)
3. Provider confirms patient contact info, clicks "Generate Link"
4. System creates a SMART Health Link and sends it via SMS/email
5. Patient clicks the link and downloads their documents - no login required
6. Patient receives notifications whenever someone accesses their documents

## Production URLs

| Service | URL | Description |
|---------|-----|-------------|
| Viewer | https://myhealthurl.com | Patient document viewer |
| Provider App | https://app.myhealthurl.com | SMART on FHIR provider app |
| API | https://api.myhealthurl.com | Backend API |

## Technical Stack

- **Backend**: Fastify + TypeScript
- **Frontend**: React + Vite + TailwindCSS
- **Database**: SQLite with Drizzle ORM
- **Storage**: AWS S3
- **Encryption**: jose (JWE), pako (DEFLATE)
- **Deployment**: fly.io
- **CI/CD**: GitHub Actions

## Project Structure

```
myhealthurl/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # Provider app (React)
│   └── viewer/       # Patient viewer (React)
├── packages/
│   └── shared/       # Shared types and utilities
├── .github/
│   └── workflows/    # GitHub Actions CI/CD
└── docs/             # Additional documentation
```

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 8+
- AWS credentials (for S3)
- Practice Fusion developer access

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Start all services
pnpm dev
```

### Local URLs

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| Provider App | http://localhost:5173 |
| Viewer | http://localhost:5174 |

## Environment Variables

### API Server

```bash
# Practice Fusion OAuth
PRACTICE_FUSION_CLIENT_ID=
PRACTICE_FUSION_CLIENT_SECRET=
PRACTICE_FUSION_DOCS_BASE_URL=https://qa-api.practicefusion.com/ehr/documents/v3

# Database
DATABASE_URL=file:./data/myhealthurl.db

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-west-2
S3_BUCKET_NAME=myhealthurl-files

# Twilio (SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# AWS SES (Email)
SES_FROM_EMAIL=noreply@myhealthurl.com

# App URLs
APP_URL=https://app.myhealthurl.com
API_URL=https://api.myhealthurl.com
VIEWER_URL=https://myhealthurl.com

# Security
SESSION_SECRET=
ENCRYPTION_KEY=
```

### Web/Viewer Apps

```bash
# Set at build time via Docker ARG
VITE_API_URL=https://api.myhealthurl.com
```

## Deployment

### fly.io Apps

- `myhealthurl-api` - API server with SQLite volume
- `myhealthurl-web` - Provider web app (nginx + static)
- `myhealthurl-viewer` - Patient viewer (nginx + static)

### Deploy Manually

```bash
# Deploy API
fly deploy -a myhealthurl-api

# Deploy web app
fly deploy -a myhealthurl-web

# Deploy viewer
fly deploy -a myhealthurl-viewer
```

### CI/CD

GitHub Actions automatically deploy on push to main:
- Changes to `apps/api/` trigger API deployment
- Changes to `apps/web/` trigger web app deployment
- Changes to `apps/viewer/` trigger viewer deployment

## Practice Fusion Configuration

**OAuth Settings:**
- Launch URL: `https://api.myhealthurl.com/launch`
- Redirect URI: `https://api.myhealthurl.com/callback`

**Required Scopes:**
```
launch openid fhirUser offline_access
user/Patient.read user/Practitioner.read user/Organization.read
user/Location.read user/Encounter.read user/Binary.read
document:r_document_v2
```

## Documentation

- [SPECIFICATION.md](./SPECIFICATION.md) - Full technical specification
- [CLAUDE.md](./CLAUDE.md) - AI assistant implementation guide
- [PROGRESS.md](./PROGRESS.md) - Development progress log

## Security

- All documents encrypted using JWE (AES-256-GCM) per SHL specification
- Encryption keys never stored server-side (only in URL fragment)
- Pre-signed S3 URLs with 1-hour TTL
- Access logged with IP, user agent, recipient, location
- Patient notifications on every document access

## License

Private - All rights reserved
