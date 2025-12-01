// ============================================
// Patient Types
// ============================================

export interface Patient {
  id: string;
  name: string;
  birthDate: string;
  phone: string | null;
  email: string | null;
}

// ============================================
// Document Types
// ============================================

export interface Document {
  id: string;
  name: string;
  type: string;
  date: string;
  mimeType: string;
  size: number;
}

// ============================================
// SHL Types
// ============================================

export interface ShlPayload {
  url: string;
  key: string;
  exp: number;
  label: string;
}

export interface ManifestRequest {
  recipient: string;
  embeddedLengthMax?: number;
}

export interface ManifestResponse {
  files: Array<{
    contentType: string;
    location?: string;
    embedded?: string;
  }>;
}

export type ShlStatus = 'active' | 'revoked' | 'expired';

export interface Shl {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  providerId: string;
  providerName: string;
  bundleS3Key: string;
  documentS3Keys: string[];
  status: ShlStatus;
  expiresAt: Date;
  accessCount: number;
  lastAccessedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
}

// ============================================
// API Request/Response Types
// ============================================

export interface GenerateShlRequest {
  documentIds: string[];
  phone: string | null;
  email: string | null;
  expirationDays: number;
}

export interface GenerateShlResponse {
  id: string;
  viewerUrl: string;
  expiresAt: string;
  documentCount: number;
  deliveryStatus: {
    sms: 'sent' | 'failed' | 'skipped';
    email: 'sent' | 'failed' | 'skipped';
  };
}

export interface SessionResponse {
  patient: Patient;
  documents: Document[];
  provider: {
    id: string;
    name: string;
  };
}

export interface ShlDetailsResponse {
  id: string;
  status: ShlStatus;
  patientName: string;
  documentCount: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  accessCount: number;
  accessLog: AccessLogEntry[];
}

export interface AccessLogEntry {
  timestamp: string;
  recipient: string;
  location: string | null;
  device: string | null;
}

// ============================================
// Audit Log Types
// ============================================

export type AuditEventType =
  | 'SHL_CREATED'
  | 'SHL_DELIVERED_SMS'
  | 'SHL_DELIVERED_EMAIL'
  | 'SHL_DELIVERY_FAILED'
  | 'SHL_ACCESSED'
  | 'SHL_REVOKED';

export interface AuditLogEntry {
  id: string;
  shlId: string;
  eventType: AuditEventType;
  accessorIp?: string;
  accessorUserAgent?: string;
  accessorRecipient?: string;
  accessorLocation?: {
    city: string;
    region: string;
    country: string;
  } | null;
  providerId?: string;
  providerName?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// Access Context
// ============================================

export interface AccessContext {
  ip: string;
  userAgent: string;
  recipient: string;
  location: {
    city: string;
    region: string;
    country: string;
  } | null;
  timestamp: Date;
}

// ============================================
// FHIR Types (minimal for our use case)
// ============================================

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  meta?: {
    lastUpdated?: string;
  };
  identifier?: Array<{
    system?: string;
    value?: string;
  }>;
  name?: Array<{
    use?: string;
    text?: string;
    given?: string[];
    family?: string;
    prefix?: string[];
    suffix?: string[];
  }>;
  telecom?: Array<{
    system?: string;
    value?: string;
    use?: string;
  }>;
  gender?: string;
  birthDate?: string;
  address?: Array<{
    use?: string;
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

export interface FhirDocumentReference {
  resourceType: 'DocumentReference';
  id: string;
  meta?: {
    profile?: string[];
  };
  status: 'current' | 'superseded' | 'entered-in-error';
  type?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  category?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
    }>;
  }>;
  subject?: {
    reference?: string;
  };
  date?: string;
  author?: Array<{
    reference?: string;
    display?: string;
  }>;
  content: Array<{
    attachment: {
      contentType?: string;
      url?: string;
      title?: string;
      size?: number;
    };
  }>;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'collection';
  timestamp: string;
  entry: Array<{
    fullUrl: string;
    resource: FhirPatient | FhirDocumentReference;
  }>;
}

// ============================================
// Practice Fusion Types
// ============================================

export interface PracticeFusionDocument {
  documentGuid: string;
  documentName: string;
  documentType: string;
  documentTypeGuid: string;
  documentDateTime: string;
  comments?: string;
  patientPracticeGuid: string;
  isSigned: boolean;
  documentContentMetadata: {
    filename: string;
    mediaType: string;
    size: number;
    status: string;
  };
  meta: {
    links: {
      content: string;
      self: string;
    };
  };
}

// ============================================
// SMART on FHIR Types
// ============================================

export interface SmartConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  capabilities?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  patient?: string;
  fhirUser?: string;
}
