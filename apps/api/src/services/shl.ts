/**
 * SHL Service
 *
 * Core service for SMART Health Link operations:
 * - Generate SHL keys and manifest IDs
 * - Create FHIR bundles with Patient and DocumentReference resources
 * - Create SHL payloads for encoding in URLs
 */

import * as jose from 'jose';
import { config } from '../config.js';
import {
  generateShlKey,
  generateManifestId,
  encryptContent,
  encryptString,
} from './encryption.js';
import {
  uploadBundle,
  uploadDocument,
  generateSignedUrl,
} from './storage.js';
import { getDocumentContent, getDocumentMetadata } from './documents.js';
import { getPatient, getPatientDisplayName } from './fhir.js';
import type {
  FhirPatient,
  FhirDocumentReference,
  FhirBundle,
  PracticeFusionDocument,
  ShlPayload,
} from '@myhealthurl/shared';
import {
  FHIR_US_CORE_DOCUMENT_REFERENCE_PROFILE,
  FHIR_NULL_FLAVOR_SYSTEM,
  FHIR_DOCUMENT_CATEGORY_SYSTEM,
} from '@myhealthurl/shared';

// ============================================
// Types
// ============================================

export interface GenerateShlParams {
  sessionId: string;
  fhirBaseUrl: string;
  patientId: string;
  accessToken: string;
  documentIds: string[];
  phone: string | null;
  email: string | null;
  expirationDays: number;
  providerId: string;
  providerName: string;
}

export interface GenerateShlResult {
  id: string;
  viewerUrl: string;
  shlPayload: string;
  bundleS3Key: string;
  documentS3Keys: string[];
  expiresAt: Date;
  patientName: string;
}

export interface UploadedDocument {
  documentId: string;
  s3Key: string;
  s3Url: string;
  contentType: string;
  size: number;
  metadata: PracticeFusionDocument;
}

// ============================================
// FHIR Bundle Creation
// ============================================

/**
 * Create a FHIR DocumentReference resource from Practice Fusion document
 *
 * IMPORTANT: SHL vs FHIR Interoperability Design Decision
 * --------------------------------------------------------
 * The `contentType` field describes the DECRYPTED content type (e.g., application/pdf),
 * NOT the wire format (application/jose). This is intentional for SHL because:
 *
 * 1. The entire FHIR bundle is JWE-encrypted - within that encrypted context,
 *    contentType describes what the viewer gets after decryption.
 * 2. The viewer uses contentType to render/download files correctly after decryption.
 * 3. The JWE header already contains `cty` with the original content type.
 *
 * This differs from traditional FHIR interop (US Core, USCDI) where contentType
 * should match the actual bytes returned by the URL. For SHL, the encrypted bundle
 * is a self-contained package where all references are relative to decrypted content.
 *
 * The S3 URL is a pre-signed URL (1-hour TTL) that returns JWE-encrypted content.
 * Fresh URLs are generated on each manifest request, so expiration is not an issue
 * for the SHL use case (patient opens link → gets fresh URLs → downloads documents).
 *
 * See SPECIFICATION.md Section 16.5 for full rationale.
 */
export function createDocumentReference(
  doc: PracticeFusionDocument,
  s3Url: string,
  patientId: string
): FhirDocumentReference {
  return {
    resourceType: 'DocumentReference',
    id: `doc-${doc.documentGuid}`,
    meta: {
      profile: [FHIR_US_CORE_DOCUMENT_REFERENCE_PROFILE],
    },
    status: 'current',
    type: {
      coding: [
        {
          system: FHIR_NULL_FLAVOR_SYSTEM,
          code: 'UNK',
          display: doc.documentType || 'Document',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: FHIR_DOCUMENT_CATEGORY_SYSTEM,
            code: 'clinical-note',
          },
        ],
      },
    ],
    subject: {
      reference: `Patient/${patientId}`,
    },
    date: doc.documentDateTime,
    content: [
      {
        attachment: {
          // contentType is the DECRYPTED type, not wire format (see function comment)
          contentType: doc.documentContentMetadata?.mediaType || 'application/octet-stream',
          url: s3Url,
          title: doc.documentName,
          size: doc.documentContentMetadata?.size,
        },
      },
    ],
  };
}

/**
 * Create a FHIR Bundle containing Patient and DocumentReferences
 */
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
        resource: patient,
      },
      ...documentRefs.map((doc) => ({
        fullUrl: `urn:uuid:${crypto.randomUUID()}`,
        resource: doc,
      })),
    ],
  };
}

// ============================================
// SHL Payload Creation
// ============================================

/**
 * Create an SHL payload for encoding in URL
 */
export function createShlPayload(params: {
  manifestUrl: string;
  keyBase64Url: string;
  expiresAt: Date;
  patientName: string;
}): ShlPayload {
  return {
    url: params.manifestUrl,
    key: params.keyBase64Url,
    exp: Math.floor(params.expiresAt.getTime() / 1000),
    label: `Documents for ${params.patientName}`.slice(0, 80),
  };
}

/**
 * Encode SHL payload to base64url for URL fragment
 */
export function encodeShlPayload(payload: ShlPayload): string {
  const json = JSON.stringify(payload);
  return jose.base64url.encode(new TextEncoder().encode(json));
}

/**
 * Create the full SHL viewer URL
 */
export function createViewerUrl(shlPayloadBase64: string): string {
  return `${config.VIEWER_URL}/#shlink:/${shlPayloadBase64}`;
}

// ============================================
// SHL Generation
// ============================================

/**
 * Generate a complete SMART Health Link
 *
 * This is the main entry point for SHL generation:
 * 1. Fetch patient info from FHIR API
 * 2. Fetch each document from Practice Fusion
 * 3. Generate SHL encryption key
 * 4. Encrypt and upload each document to S3
 * 5. Create FHIR bundle with Patient + DocumentReferences
 * 6. Encrypt and upload bundle to S3
 * 7. Generate manifest ID and SHL payload
 * 8. Return all data needed for database storage
 */
export async function generateShl(params: GenerateShlParams): Promise<GenerateShlResult> {
  const {
    fhirBaseUrl,
    patientId,
    accessToken,
    documentIds,
    expirationDays,
  } = params;

  // 1. Generate SHL key (256 bits) - this key is NEVER stored server-side
  const { key, keyBase64Url } = generateShlKey();

  // 2. Generate manifest ID (256 bits of entropy)
  const manifestId = generateManifestId();

  // 3. Fetch patient from FHIR API
  const patient = await getPatient(fhirBaseUrl, patientId, accessToken);
  const patientName = getPatientDisplayName(patient);

  // 4. Fetch, encrypt, and upload each document
  const uploadedDocs: UploadedDocument[] = [];

  for (const docId of documentIds) {
    // Get document metadata
    const metadata = await getDocumentMetadata(docId, accessToken);

    // Get document content
    const { content, contentType } = await getDocumentContent(docId, accessToken);

    // Encrypt document content with SHL key
    const encryptedContent = await encryptContent(content, key, contentType);

    // Upload encrypted document to S3
    const s3Key = await uploadDocument(manifestId, docId, encryptedContent, contentType);

    // Generate pre-signed URL for the document
    const s3Url = await generateSignedUrl(s3Key);

    uploadedDocs.push({
      documentId: docId,
      s3Key,
      s3Url,
      contentType,
      size: content.length,
      metadata,
    });
  }

  // 5. Create DocumentReference resources with S3 URLs
  // Note: The bundle will contain URLs that point to the encrypted documents
  // The viewer will need to use the SHL key to decrypt them
  const documentRefs = uploadedDocs.map((doc) =>
    createDocumentReference(doc.metadata, doc.s3Url, patientId)
  );

  // 6. Create FHIR Bundle
  const bundle = createFhirBundle(patient, documentRefs);

  // 7. Encrypt bundle with SHL key
  const bundleJson = JSON.stringify(bundle);
  const encryptedBundle = await encryptString(bundleJson, key, 'application/fhir+json');

  // 8. Upload encrypted bundle to S3
  const bundleS3Key = await uploadBundle(manifestId, encryptedBundle);

  // 9. Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  // 10. Create SHL payload
  const manifestUrl = `${config.API_URL}/shl/${manifestId}/manifest`;
  const shlPayload = createShlPayload({
    manifestUrl,
    keyBase64Url,
    expiresAt,
    patientName,
  });

  // 11. Encode payload and create viewer URL
  const shlPayloadBase64 = encodeShlPayload(shlPayload);
  const viewerUrl = createViewerUrl(shlPayloadBase64);

  return {
    id: manifestId,
    viewerUrl,
    shlPayload: `shlink:/${shlPayloadBase64}`,
    bundleS3Key,
    documentS3Keys: uploadedDocs.map((d) => d.s3Key),
    expiresAt,
    patientName,
  };
}

/**
 * Get a pre-signed URL for the bundle
 * Used by the manifest endpoint to return the bundle location
 */
export async function getBundleUrl(bundleS3Key: string): Promise<string> {
  return generateSignedUrl(bundleS3Key);
}
