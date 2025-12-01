# MyHealthURL

A SMART on FHIR application for sharing patient documents via secure, expiring links (SMART Health Links).

## Features

- Share patient documents without patient portal logins
- Encrypted, expiring links per SHL specification
- Access notifications for patients
- QR code sharing support

## Architecture

| Service | URL | Description |
|---------|-----|-------------|
| Viewer | myhealthurl.com | Patient document viewer |
| Provider App | app.myhealthurl.com | SMART on FHIR provider app |
| API | api.myhealthurl.com | Backend API |

## Development

```bash
# Install dependencies
pnpm install

# Start all services
pnpm dev

# Type check
pnpm typecheck
```

## Deployment

Deployed on fly.io. See internal documentation for deployment procedures.

## License

Private - All rights reserved
