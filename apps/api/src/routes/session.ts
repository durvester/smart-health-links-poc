/**
 * Session Routes
 *
 * Handles session management:
 * - GET /api/session - Get current session data (patient + documents)
 * - POST /api/session/logout - End session
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { config } from '../config.js';
import { decryptTokenFromStorage } from '../services/encryption.js';
import { getPatient, getPatientDisplayName, getPatientPhone, getPatientEmail } from '../services/fhir.js';
import { listDocuments, formatDocumentDate, formatFileSize, getDocumentTypeDisplay } from '../services/documents.js';

interface SessionResponse {
  patient: {
    id: string;
    name: string;
    birthDate?: string;
    gender?: string;
    phone?: string;
    email?: string;
  };
  documents: Array<{
    id: string;
    name: string;
    type: string;
    date: string;
    size: string;
    contentType: string;
  }>;
}

/**
 * Get session from cookie
 */
async function getSessionFromCookie(request: FastifyRequest) {
  const sessionId = request.cookies.session;

  if (!sessionId) {
    return null;
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return session;
}

export async function registerSessionRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/session
   * Get current session data including patient info and documents
   */
  fastify.get('/api/session', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await getSessionFromCookie(request);

    if (!session) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'No valid session found',
      });
    }

    try {
      // Decrypt access token
      const encryptionKey = Buffer.from(config.ENCRYPTION_KEY, 'hex');
      const accessToken = await decryptTokenFromStorage(
        session.accessTokenEncrypted,
        encryptionKey
      );

      // Fetch patient data from FHIR API
      const patient = await getPatient(session.iss, session.patientId, accessToken);

      // Fetch documents from Practice Fusion Documents API
      const documents = await listDocuments(session.patientId, accessToken);

      const response: SessionResponse = {
        patient: {
          id: session.patientId,
          name: getPatientDisplayName(patient),
          birthDate: patient.birthDate,
          gender: patient.gender,
          phone: getPatientPhone(patient),
          email: getPatientEmail(patient),
        },
        documents: documents.map((doc) => ({
          id: doc.documentGuid,
          name: doc.documentName || 'Untitled Document',
          type: getDocumentTypeDisplay(doc.documentType),
          date: formatDocumentDate(doc.documentDateTime),
          size: formatFileSize(doc.documentContentMetadata?.size),
          contentType: doc.documentContentMetadata?.mediaType || 'application/octet-stream',
        })),
      };

      return response;
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch session data');

      // If token is invalid/expired, clear the session
      if (error instanceof Error && error.message.includes('401')) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
        reply.clearCookie('session');
        return reply.status(401).send({
          error: 'Session expired',
          message: 'Your session has expired. Please log in again.',
        });
      }

      return reply.status(500).send({
        error: 'Failed to load session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/session/logout
   * End current session
   */
  fastify.post('/api/session/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies.session;

    if (sessionId) {
      // Delete session from database
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }

    // Clear session cookie
    reply.clearCookie('session', { path: '/' });

    return { success: true };
  });

  /**
   * GET /api/session/check
   * Quick check if session is valid (doesn't fetch data)
   */
  fastify.get('/api/session/check', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await getSessionFromCookie(request);

    if (!session) {
      return reply.status(401).send({ authenticated: false });
    }

    return { authenticated: true, patientId: session.patientId };
  });
}
