import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================
// Sessions Table
// ============================================
// Stores OAuth sessions from SMART launch

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),

  // FHIR server info (iss from SMART launch)
  iss: text('iss').notNull(),

  // Patient context
  patientId: text('patient_id').notNull(),
  patientName: text('patient_name'),

  // Provider context (from fhirUser)
  providerId: text('provider_id').notNull(),
  providerName: text('provider_name'),

  // Encrypted OAuth tokens
  accessTokenEncrypted: blob('access_token_encrypted', { mode: 'buffer' }).notNull(),
  refreshTokenEncrypted: blob('refresh_token_encrypted', { mode: 'buffer' }),

  // Token expiration
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),

  // Audit
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ============================================
// SHLs Table
// ============================================
// Stores SMART Health Link metadata

export const shls = sqliteTable('shls', {
  // Manifest path ID (43 chars base64url, 256 bits entropy)
  id: text('id').primaryKey(),

  // Session reference (nullable - session may expire)
  sessionId: text('session_id').references(() => sessions.id),

  // Patient info (denormalized for display after session expires)
  patientId: text('patient_id').notNull(),
  patientName: text('patient_name').notNull(),
  patientPhone: text('patient_phone'),
  patientEmail: text('patient_email'),

  // Provider info
  providerId: text('provider_id').notNull(),
  providerName: text('provider_name').notNull(),

  // S3 storage references
  bundleS3Key: text('bundle_s3_key').notNull(),
  documentS3Keys: text('document_s3_keys').notNull(), // JSON array of S3 keys

  // Status
  status: text('status', { enum: ['active', 'revoked', 'expired'] }).notNull().default('active'),

  // Expiration
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),

  // Access tracking
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  revokedBy: text('revoked_by'),
});

// ============================================
// Audit Logs Table
// ============================================
// Tracks all SHL events for compliance

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),

  // SHL reference
  shlId: text('shl_id').references(() => shls.id),

  // Event type
  eventType: text('event_type', {
    enum: [
      'SHL_CREATED',
      'SHL_DELIVERED_SMS',
      'SHL_DELIVERED_EMAIL',
      'SHL_DELIVERY_FAILED',
      'SHL_ACCESSED',
      'SHL_REVOKED',
    ],
  }).notNull(),

  // Access details (for SHL_ACCESSED events)
  accessorIp: text('accessor_ip'),
  accessorUserAgent: text('accessor_user_agent'),
  accessorRecipient: text('accessor_recipient'),
  accessorLocation: text('accessor_location'), // JSON: {city, region, country}

  // Actor details (for generation/revocation events)
  providerId: text('provider_id'),
  providerName: text('provider_name'),

  // Additional context
  details: text('details'), // JSON for extra info

  // Timestamp
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ============================================
// Type exports for use in application
// ============================================

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Shl = typeof shls.$inferSelect;
export type NewShl = typeof shls.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
