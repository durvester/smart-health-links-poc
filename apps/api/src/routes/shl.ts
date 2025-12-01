/**
 * SHL Routes
 *
 * Handles SMART Health Link generation and management:
 * - POST /api/shl - Generate a new SHL
 * - GET /api/shls - List SHLs for current patient
 * - GET /api/shls/:id - Get SHL details with access log
 * - POST /api/shls/:id/revoke - Revoke an SHL
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, shls, auditLogs } from '../db/schema.js';
import { config } from '../config.js';
import { decryptTokenFromStorage } from '../services/encryption.js';
import { generateShl } from '../services/shl.js';
import { sendDeliveryNotification } from '../services/notifications.js';
import type { GenerateShlResponse } from '@myhealthurl/shared';

// Get encryption key as Uint8Array
function getEncryptionKey(): Uint8Array {
  return new Uint8Array(Buffer.from(config.ENCRYPTION_KEY, 'hex'));
}

// ============================================
// Middleware
// ============================================

async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{
  sessionId: string;
  iss: string;
  patientId: string;
  providerId: string;
  providerName: string;
  accessToken: string;
} | null> {
  const sessionId = request.cookies.session;

  if (!sessionId) {
    reply.status(401).send({ error: 'Not authenticated' });
    return null;
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    reply.status(401).send({ error: 'Session not found' });
    return null;
  }

  if (session.expiresAt < new Date()) {
    reply.status(401).send({ error: 'Session expired' });
    return null;
  }

  // Decrypt access token
  const accessToken = await decryptTokenFromStorage(
    session.accessTokenEncrypted,
    getEncryptionKey()
  );

  return {
    sessionId: session.id,
    iss: session.iss,
    patientId: session.patientId,
    providerId: session.providerId,
    providerName: session.providerName || 'Unknown Provider',
    accessToken,
  };
}

// ============================================
// Route Handlers
// ============================================

interface GenerateShlBody {
  documentIds: string[];
  phone: string | null;
  email: string | null;
  expirationDays: number;
}

/**
 * POST /api/shl - Generate a new SMART Health Link
 */
async function handleGenerateShl(
  request: FastifyRequest<{ Body: GenerateShlBody }>,
  reply: FastifyReply
): Promise<void> {
  const session = await requireSession(request, reply);
  if (!session) return;

  const { documentIds, phone, email, expirationDays } = request.body;

  // Validate request
  if (!documentIds || documentIds.length === 0) {
    reply.status(400).send({ error: 'At least one document must be selected' });
    return;
  }

  if (!phone && !email) {
    reply.status(400).send({ error: 'At least one contact method (phone or email) is required' });
    return;
  }

  // Validate expiration days
  const validExpiration = Math.min(
    Math.max(1, expirationDays || config.SHL_EXPIRATION_DAYS_DEFAULT),
    config.SHL_EXPIRATION_DAYS_MAX
  );

  try {
    // Generate the SHL
    const result = await generateShl({
      sessionId: session.sessionId,
      fhirBaseUrl: session.iss,
      patientId: session.patientId,
      accessToken: session.accessToken,
      documentIds,
      phone,
      email,
      expirationDays: validExpiration,
      providerId: session.providerId,
      providerName: session.providerName,
    });

    // Store SHL in database
    await db.insert(shls).values({
      id: result.id,
      sessionId: session.sessionId,
      patientId: session.patientId,
      patientName: result.patientName,
      patientPhone: phone,
      patientEmail: email,
      providerId: session.providerId,
      providerName: session.providerName,
      bundleS3Key: result.bundleS3Key,
      documentS3Keys: JSON.stringify(result.documentS3Keys),
      status: 'active',
      expiresAt: result.expiresAt,
    });

    // Log creation event
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      shlId: result.id,
      eventType: 'SHL_CREATED',
      providerId: session.providerId,
      providerName: session.providerName,
      details: JSON.stringify({
        documentCount: documentIds.length,
        expirationDays: validExpiration,
      }),
    });

    // Send notifications (async, don't wait)
    const deliveryStatus = await sendDeliveryNotification({
      type: 'delivery',
      patientName: result.patientName,
      phone,
      email,
      viewerUrl: result.viewerUrl,
      expiresAt: result.expiresAt,
      documentCount: documentIds.length,
    });

    // Log delivery events
    if (phone) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        shlId: result.id,
        eventType: deliveryStatus.sms === 'sent' ? 'SHL_DELIVERED_SMS' : 'SHL_DELIVERY_FAILED',
        details: JSON.stringify({ phone, status: deliveryStatus.sms }),
      });
    }

    if (email) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        shlId: result.id,
        eventType: deliveryStatus.email === 'sent' ? 'SHL_DELIVERED_EMAIL' : 'SHL_DELIVERY_FAILED',
        details: JSON.stringify({ email, status: deliveryStatus.email }),
      });
    }

    // Return response
    const response: GenerateShlResponse = {
      id: result.id,
      viewerUrl: result.viewerUrl,
      expiresAt: result.expiresAt.toISOString(),
      documentCount: documentIds.length,
      deliveryStatus,
    };

    reply.status(201).send(response);
  } catch (error) {
    request.log.error(error, 'Failed to generate SHL');
    reply.status(500).send({ error: 'Failed to generate health link' });
  }
}

/**
 * GET /api/shls - List SHLs for current patient
 */
async function handleListShls(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const session = await requireSession(request, reply);
  if (!session) return;

  try {
    const shlList = await db
      .select({
        id: shls.id,
        patientName: shls.patientName,
        status: shls.status,
        expiresAt: shls.expiresAt,
        accessCount: shls.accessCount,
        createdAt: shls.createdAt,
      })
      .from(shls)
      .where(eq(shls.patientId, session.patientId))
      .orderBy(desc(shls.createdAt));

    // Check for expired links and update status
    const now = new Date();
    const results = shlList.map((shl) => ({
      ...shl,
      status: shl.expiresAt < now && shl.status === 'active' ? 'expired' : shl.status,
      documentCount: 0, // Will be populated from documentS3Keys if needed
    }));

    reply.send({ shls: results });
  } catch (error) {
    request.log.error(error, 'Failed to list SHLs');
    reply.status(500).send({ error: 'Failed to list health links' });
  }
}

/**
 * GET /api/shls/:id - Get SHL details with access log
 */
async function handleGetShlDetails(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const session = await requireSession(request, reply);
  if (!session) return;

  const { id } = request.params;

  try {
    // Get SHL
    const [shl] = await db
      .select()
      .from(shls)
      .where(and(eq(shls.id, id), eq(shls.patientId, session.patientId)))
      .limit(1);

    if (!shl) {
      reply.status(404).send({ error: 'Health link not found' });
      return;
    }

    // Get access logs
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.shlId, id))
      .orderBy(desc(auditLogs.timestamp));

    // Parse document keys to get count
    const documentS3Keys = JSON.parse(shl.documentS3Keys) as string[];

    // Check if expired
    const now = new Date();
    const status = shl.expiresAt < now && shl.status === 'active' ? 'expired' : shl.status;

    // Format access log
    const accessLog = logs
      .filter((log) => log.eventType === 'SHL_ACCESSED')
      .map((log) => ({
        timestamp: log.timestamp?.toISOString() || new Date().toISOString(),
        recipient: log.accessorRecipient || 'Unknown',
        location: log.accessorLocation ? JSON.parse(log.accessorLocation) : null,
        device: log.accessorUserAgent || null,
      }));

    reply.send({
      id: shl.id,
      status,
      patientName: shl.patientName,
      documentCount: documentS3Keys.length,
      expiresAt: shl.expiresAt?.toISOString(),
      createdAt: shl.createdAt?.toISOString(),
      createdBy: shl.providerName,
      accessCount: shl.accessCount,
      accessLog,
    });
  } catch (error) {
    request.log.error(error, 'Failed to get SHL details');
    reply.status(500).send({ error: 'Failed to get health link details' });
  }
}

/**
 * POST /api/shls/:id/revoke - Revoke an SHL
 */
async function handleRevokeShl(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const session = await requireSession(request, reply);
  if (!session) return;

  const { id } = request.params;

  try {
    // Get SHL
    const [shl] = await db
      .select()
      .from(shls)
      .where(and(eq(shls.id, id), eq(shls.patientId, session.patientId)))
      .limit(1);

    if (!shl) {
      reply.status(404).send({ error: 'Health link not found' });
      return;
    }

    if (shl.status === 'revoked') {
      reply.status(400).send({ error: 'Health link is already revoked' });
      return;
    }

    // Update status
    await db
      .update(shls)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: session.providerId,
      })
      .where(eq(shls.id, id));

    // Log revocation
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      shlId: id,
      eventType: 'SHL_REVOKED',
      providerId: session.providerId,
      providerName: session.providerName,
    });

    reply.send({ success: true, message: 'Health link revoked' });
  } catch (error) {
    request.log.error(error, 'Failed to revoke SHL');
    reply.status(500).send({ error: 'Failed to revoke health link' });
  }
}

// ============================================
// Route Registration
// ============================================

export async function registerShlRoutes(fastify: FastifyInstance): Promise<void> {
  // Generate SHL
  fastify.post('/api/shl', handleGenerateShl);

  // List SHLs
  fastify.get('/api/shls', handleListShls);

  // Get SHL details
  fastify.get('/api/shls/:id', handleGetShlDetails);

  // Revoke SHL
  fastify.post('/api/shls/:id/revoke', handleRevokeShl);
}
