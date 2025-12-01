/**
 * Practice Fusion Documents API Service
 *
 * Handles document operations using Practice Fusion's proprietary Documents API
 * Base URL: https://qa-api.practicefusion.com/ehr/documents/v3
 */

import { config } from '../config.js';
import type { PracticeFusionDocument } from '@myhealthurl/shared';

interface DocumentsListResponse {
  documents: PracticeFusionDocument[];
  totalCount?: number;
}

/**
 * List documents for a patient
 *
 * @param patientId - Practice Fusion patient GUID
 * @param accessToken - OAuth access token
 * @returns Array of documents
 */
export async function listDocuments(
  patientId: string,
  accessToken: string
): Promise<PracticeFusionDocument[]> {
  const url = new URL(`${config.PRACTICE_FUSION_DOCS_BASE_URL}/documents`);
  url.searchParams.set('patientPracticeGuid', patientId);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list documents: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as DocumentsListResponse;
  return data.documents || [];
}

/**
 * Get document content (binary)
 *
 * @param documentGuid - Practice Fusion document GUID
 * @param accessToken - OAuth access token
 * @returns Document content as Uint8Array and content type
 */
export async function getDocumentContent(
  documentGuid: string,
  accessToken: string
): Promise<{ content: Uint8Array; contentType: string }> {
  const url = `${config.PRACTICE_FUSION_DOCS_BASE_URL}/documents/${documentGuid}/content`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get document content: ${response.status} - ${errorText}`);
  }

  const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
  const buffer = await response.arrayBuffer();

  return {
    content: new Uint8Array(buffer),
    contentType,
  };
}

/**
 * Get document metadata
 *
 * @param documentGuid - Practice Fusion document GUID
 * @param accessToken - OAuth access token
 * @returns Document metadata
 */
export async function getDocumentMetadata(
  documentGuid: string,
  accessToken: string
): Promise<PracticeFusionDocument> {
  const url = `${config.PRACTICE_FUSION_DOCS_BASE_URL}/documents/${documentGuid}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get document metadata: ${response.status} - ${errorText}`);
  }

  return (await response.json()) as PracticeFusionDocument;
}

/**
 * Format document date for display
 */
export function formatDocumentDate(dateString: string | undefined): string {
  if (!dateString) return 'Unknown date';

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Get file extension from content type
 */
export function getFileExtension(contentType: string): string {
  const extensionMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };

  return extensionMap[contentType] || 'bin';
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return 'Unknown size';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Get document type display name
 */
export function getDocumentTypeDisplay(documentType: string | undefined): string {
  if (!documentType) return 'Document';

  // Clean up common document type names
  const typeMap: Record<string, string> = {
    'lab_result': 'Lab Result',
    'clinical_note': 'Clinical Note',
    'imaging_report': 'Imaging Report',
    'prescription': 'Prescription',
    'referral': 'Referral',
    'discharge_summary': 'Discharge Summary',
    'consent_form': 'Consent Form',
    'insurance_document': 'Insurance Document',
  };

  const normalized = documentType.toLowerCase().replace(/\s+/g, '_');
  return typeMap[normalized] || documentType;
}
