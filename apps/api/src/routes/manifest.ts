/**
 * Manifest Routes (Public)
 *
 * Handles the public SMART Health Link manifest endpoint:
 * - POST /shl/:id/manifest - Return manifest with pre-signed bundle URL
 *
 * This endpoint is PUBLIC (no authentication required) per SHL spec.
 * The security is provided by the 256-bit manifest ID and encryption key.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { shls, auditLogs } from '../db/schema.js';
import { getBundleUrl } from '../services/shl.js';
import { sendAccessNotification } from '../services/notifications.js';
import type { ManifestRequest, ManifestResponse } from '@myhealthurl/shared';

// ============================================
// Geolocation Helper
// ============================================

interface GeoLocation {
  city: string;
  region: string;
  country: string;
}

/**
 * Get geolocation from IP address
 * Uses a free IP geolocation API - in production, use a paid service
 */
async function getGeoLocation(ip: string): Promise<GeoLocation | null> {
  // Skip for localhost/private IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { city: 'Local', region: 'Development', country: 'localhost' };
  }

  try {
    // Using ip-api.com free tier (limited to 45 requests per minute)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country`);
    if (!response.ok) return null;

    const data = await response.json() as { city: string; regionName: string; country: string };
    return {
      city: data.city || 'Unknown',
      region: data.regionName || 'Unknown',
      country: data.country || 'Unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Get client IP address from request
 */
function getClientIp(request: FastifyRequest): string {
  // Check common proxy headers
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
    return ips[0].trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return request.ip;
}


// ============================================
// Route Handlers
// ============================================

interface ManifestBody extends ManifestRequest {
  recipient: string;
}

/**
 * POST /shl/:id/manifest - Return manifest with pre-signed bundle URL
 *
 * Per SHL spec, this endpoint:
 * 1. Validates the SHL exists and is not expired/revoked
 * 2. Logs the access with IP, user agent, recipient, and location
 * 3. Sends access notification to patient (async)
 * 4. Returns manifest with pre-signed S3 URL for the bundle
 */
async function handleManifest(
  request: FastifyRequest<{ Params: { id: string }; Body: ManifestBody }>,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params;
  const { recipient } = request.body;

  // 1. Find the SHL
  const [shl] = await db
    .select()
    .from(shls)
    .where(eq(shls.id, id))
    .limit(1);

  if (!shl) {
    reply.status(404).send({ error: 'Link not found' });
    return;
  }

  // 2. Check status
  if (shl.status === 'revoked') {
    reply.status(410).send({ error: 'This link has been revoked' });
    return;
  }

  // 3. Check expiration
  const now = new Date();
  if (shl.expiresAt < now) {
    // Update status to expired
    await db.update(shls).set({ status: 'expired' }).where(eq(shls.id, id));
    reply.status(410).send({ error: 'This link has expired' });
    return;
  }

  // 4. Gather access context
  const clientIp = getClientIp(request);
  const userAgent = request.headers['user-agent'];
  const location = await getGeoLocation(clientIp);

  // 5. Log access
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    shlId: id,
    eventType: 'SHL_ACCESSED',
    accessorIp: clientIp,
    accessorUserAgent: userAgent,
    accessorRecipient: recipient || 'Anonymous',
    accessorLocation: location ? JSON.stringify(location) : null,
  });

  // 6. Update access count
  await db
    .update(shls)
    .set({
      accessCount: shl.accessCount + 1,
      lastAccessedAt: now,
    })
    .where(eq(shls.id, id));

  // 7. Send access notification (async, don't wait)
  sendAccessNotification({
    type: 'access',
    patientName: shl.patientName,
    phone: shl.patientPhone,
    email: shl.patientEmail,
    recipient: recipient || 'Anonymous',
    location: location ? `${location.city}, ${location.region}, ${location.country}` : null,
    accessTime: now,
  }).catch((err) => {
    request.log.error(err, 'Failed to send access notification');
  });

  // 8. Generate pre-signed URL for the bundle
  const bundleUrl = await getBundleUrl(shl.bundleS3Key);

  // 9. Return manifest response per SHL spec
  const response: ManifestResponse = {
    files: [
      {
        contentType: 'application/fhir+json',
        location: bundleUrl,
      },
    ],
  };

  reply.send(response);
}

// ============================================
// Route Registration
// ============================================

export async function registerManifestRoutes(fastify: FastifyInstance): Promise<void> {
  // Public manifest endpoint
  fastify.post('/shl/:id/manifest', handleManifest);
}
