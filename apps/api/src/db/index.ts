import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { config } from '../config.js';

// Create database connection
const sqlite = new Database(config.DATABASE_PATH);

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');

// Create tables if they don't exist (auto-migration for production)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    iss TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    patient_name TEXT,
    provider_id TEXT NOT NULL,
    provider_name TEXT,
    access_token_encrypted BLOB NOT NULL,
    refresh_token_encrypted BLOB,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS shls (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    patient_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    patient_phone TEXT,
    patient_email TEXT,
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    bundle_s3_key TEXT NOT NULL,
    document_s3_keys TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'expired')),
    expires_at INTEGER NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at INTEGER,
    revoked_by TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    shl_id TEXT REFERENCES shls(id),
    event_type TEXT NOT NULL CHECK(event_type IN ('SHL_CREATED', 'SHL_DELIVERED_SMS', 'SHL_DELIVERED_EMAIL', 'SHL_DELIVERY_FAILED', 'SHL_ACCESSED', 'SHL_REVOKED')),
    accessor_ip TEXT,
    accessor_user_agent TEXT,
    accessor_recipient TEXT,
    accessor_location TEXT,
    provider_id TEXT,
    provider_name TEXT,
    details TEXT,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON sessions(patient_id);
  CREATE INDEX IF NOT EXISTS idx_shls_patient_id ON shls(patient_id);
  CREATE INDEX IF NOT EXISTS idx_shls_status ON shls(status);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_shl_id ON audit_logs(shl_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
`);

// Create drizzle instance with schema
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export * from './schema.js';
