/**
 * SMART on FHIR Launch Routes
 *
 * Handles the SMART launch flow:
 * 1. GET /launch - Entry point from EHR, redirects to authorization
 * 2. GET /callback - Receives auth code, exchanges for tokens
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { encryptTokenForStorage } from '../services/encryption.js';
import { SMART_SCOPES } from '@myhealthurl/shared';

interface LaunchQuery {
  iss: string;
  launch: string;
}

interface CallbackQuery {
  code: string;
  state: string;
}

interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  capabilities?: string[];
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  patient?: string;
  refresh_token?: string;
  id_token?: string;
}

// In-memory state store (for development - use Redis in production)
const pendingStates = new Map<string, { iss: string; launch: string; createdAt: number }>();

// Clean up old states every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [state, data] of pendingStates.entries()) {
    if (data.createdAt < fiveMinutesAgo) {
      pendingStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

/**
 * Fetch SMART configuration from the FHIR server
 */
async function getSmartConfiguration(iss: string): Promise<SmartConfiguration> {
  // Try .well-known/smart-configuration first
  const wellKnownUrl = `${iss}/.well-known/smart-configuration`;

  try {
    const response = await fetch(wellKnownUrl);
    if (response.ok) {
      return await response.json() as SmartConfiguration;
    }
  } catch {
    // Fall through to capability statement
  }

  // Fall back to capability statement
  const capabilityUrl = `${iss}/metadata`;
  const response = await fetch(capabilityUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch SMART configuration from ${iss}`);
  }

  const capability = await response.json() as {
    rest?: Array<{
      security?: {
        extension?: Array<{
          url: string;
          extension?: Array<{
            url: string;
            valueUri?: string;
          }>;
        }>;
      };
    }>;
  };

  // Extract OAuth URIs from capability statement
  const securityExtensions = capability.rest?.[0]?.security?.extension?.find(
    (ext) => ext.url === 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris'
  );

  if (!securityExtensions?.extension) {
    throw new Error('Could not find OAuth URIs in capability statement');
  }

  const authEndpoint = securityExtensions.extension.find((e) => e.url === 'authorize')?.valueUri;
  const tokenEndpoint = securityExtensions.extension.find((e) => e.url === 'token')?.valueUri;

  if (!authEndpoint || !tokenEndpoint) {
    throw new Error('Missing authorization or token endpoint');
  }

  return {
    authorization_endpoint: authEndpoint,
    token_endpoint: tokenEndpoint,
  };
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  tokenEndpoint: string,
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.PRACTICE_FUSION_CLIENT_ID,
    client_secret: config.PRACTICE_FUSION_CLIENT_SECRET,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return await response.json() as TokenResponse;
}

export async function registerSmartRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /launch
   * Entry point for SMART launch from EHR
   */
  fastify.get<{ Querystring: LaunchQuery }>(
    '/launch',
    async (request: FastifyRequest<{ Querystring: LaunchQuery }>, reply: FastifyReply) => {
      const { iss, launch } = request.query;

      if (!iss || !launch) {
        return reply.status(400).send({
          error: 'Missing required parameters',
          message: 'Both "iss" and "launch" parameters are required',
        });
      }

      request.log.info({ iss, launch }, 'SMART launch initiated');

      try {
        // Get SMART configuration
        const smartConfig = await getSmartConfiguration(iss);
        request.log.info({ smartConfig }, 'Retrieved SMART configuration');

        // Generate state for CSRF protection
        const state = randomUUID();
        pendingStates.set(state, { iss, launch, createdAt: Date.now() });

        // Build authorization URL
        const authUrl = new URL(smartConfig.authorization_endpoint);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', config.PRACTICE_FUSION_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', `${config.API_URL}/callback`);
        authUrl.searchParams.set('scope', SMART_SCOPES);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('launch', launch);
        authUrl.searchParams.set('aud', iss);

        request.log.info({ authUrl: authUrl.toString() }, 'Redirecting to authorization');

        return reply.redirect(authUrl.toString());
      } catch (error) {
        request.log.error({ error }, 'Failed to initiate SMART launch');
        return reply.status(500).send({
          error: 'Launch failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /callback
   * OAuth callback - exchange code for tokens
   */
  fastify.get<{ Querystring: CallbackQuery }>(
    '/callback',
    async (request: FastifyRequest<{ Querystring: CallbackQuery }>, reply: FastifyReply) => {
      const { code, state } = request.query;

      if (!code || !state) {
        return reply.status(400).send({
          error: 'Missing required parameters',
          message: 'Both "code" and "state" parameters are required',
        });
      }

      // Validate state
      const pendingState = pendingStates.get(state);
      if (!pendingState) {
        return reply.status(400).send({
          error: 'Invalid state',
          message: 'State parameter is invalid or expired',
        });
      }

      pendingStates.delete(state);
      const { iss } = pendingState;

      request.log.info({ iss }, 'Processing OAuth callback');

      try {
        // Get token endpoint
        const smartConfig = await getSmartConfiguration(iss);

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(
          smartConfig.token_endpoint,
          code,
          `${config.API_URL}/callback`
        );

        request.log.info(
          { patient: tokens.patient, scope: tokens.scope },
          'Token exchange successful'
        );

        if (!tokens.patient) {
          return reply.status(400).send({
            error: 'No patient context',
            message: 'Token response did not include patient ID',
          });
        }

        // Create session
        const sessionId = randomUUID();
        const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

        // Encrypt access token for storage
        const encryptionKey = Buffer.from(config.ENCRYPTION_KEY, 'hex');
        const encryptedToken = await encryptTokenForStorage(
          tokens.access_token,
          encryptionKey
        );

        // Encrypt refresh token if present
        let encryptedRefreshToken: Buffer | null = null;
        if (tokens.refresh_token) {
          encryptedRefreshToken = await encryptTokenForStorage(
            tokens.refresh_token,
            encryptionKey
          );
        }

        // Store session in database
        // Note: providerId is extracted from fhirUser claim if available, otherwise use 'unknown'
        await db.insert(sessions).values({
          id: sessionId,
          iss,
          patientId: tokens.patient,
          providerId: 'unknown', // TODO: Extract from id_token fhirUser claim
          accessTokenEncrypted: encryptedToken,
          refreshTokenEncrypted: encryptedRefreshToken,
          expiresAt,
        });

        request.log.info({ sessionId, patientId: tokens.patient }, 'Session created');

        // Set session cookie
        // Use sameSite: 'none' to allow cross-origin iframe access (EHR embedding)
        // This requires secure: true, which means HTTPS is required
        // For local development, use ngrok or similar HTTPS tunneling service
        reply.setCookie('session', sessionId, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 60 * 60 * 24, // 24 hours
        });

        // Redirect to web app
        return reply.redirect(config.APP_URL);
      } catch (error) {
        request.log.error({ error }, 'OAuth callback failed');
        return reply.status(500).send({
          error: 'Callback failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
