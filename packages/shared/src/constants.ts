// ============================================
// SHL Constants
// ============================================

export const SHL_KEY_LENGTH = 32; // 256 bits
export const SHL_KEY_BASE64URL_LENGTH = 43; // 32 bytes base64url encoded
export const SHL_MANIFEST_ID_LENGTH = 43; // 256 bits of entropy

export const SHL_EXPIRATION_DAYS_DEFAULT = 90;
export const SHL_EXPIRATION_DAYS_MAX = 365;

// ============================================
// JWE Constants (per SHL spec)
// ============================================

export const JWE_ALGORITHM = 'dir';
export const JWE_ENCRYPTION = 'A256GCM';
export const JWE_COMPRESSION = 'DEF';

// ============================================
// S3 Constants
// ============================================

export const S3_PRESIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour
export const S3_CONTENT_TYPE_JWE = 'application/jose';

// ============================================
// Practice Fusion Constants
// ============================================

export const PRACTICE_FUSION_DOCS_BASE_URL = 'https://qa-api.practicefusion.com/ehr/documents/v3';

// Scopes must match exactly what's registered with Practice Fusion
export const SMART_SCOPES = [
  'launch',
  'openid',
  'offline_access',
  'user/Patient.read',
  'user/Practitioner.read',
  'user/Organization.read',
  'user/Encounter.read',
  'user/DocumentReference.read',
  'document:r_document_v2',
].join(' ');

// ============================================
// Supported Document Types
// ============================================

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

// ============================================
// FHIR Constants
// ============================================

export const FHIR_US_CORE_DOCUMENT_REFERENCE_PROFILE =
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference';

export const FHIR_NULL_FLAVOR_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v3-NullFlavor';

export const FHIR_DOCUMENT_CATEGORY_SYSTEM =
  'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category';
