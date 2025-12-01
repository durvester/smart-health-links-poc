/**
 * S3 Storage Service for SMART Health Links
 *
 * Handles encrypted file storage in AWS S3:
 * - Upload JWE-encrypted files
 * - Generate pre-signed URLs for download (1 hour TTL)
 * - Delete files when SHLs are revoked
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { S3_CONTENT_TYPE_JWE, S3_PRESIGNED_URL_EXPIRY_SECONDS } from '@myhealthurl/shared';

// Aliases
const S3_CONTENT_TYPE = S3_CONTENT_TYPE_JWE;
const S3_PRESIGNED_URL_EXPIRY = S3_PRESIGNED_URL_EXPIRY_SECONDS;

// Initialize S3 client
// Uses AWS_PROFILE from environment when credentials not explicitly provided
const s3Client = new S3Client({
  region: config.AWS_REGION
});

/**
 * Generate an S3 key for a file
 * Format: shls/{manifestId}/{fileId}.jwe
 *
 * @param manifestId - The SHL manifest ID
 * @param fileId - Unique identifier for the file
 * @returns S3 object key
 */
export function generateS3Key(manifestId: string, fileId: string): string {
  return `shls/${manifestId}/${fileId}.jwe`;
}

/**
 * Upload an encrypted file to S3
 *
 * @param key - S3 object key
 * @param content - JWE-encrypted content (as string or Buffer)
 * @param metadata - Optional metadata to store with the object
 * @returns Object with bucket and key for reference
 */
export async function uploadEncryptedFile(
  key: string,
  content: string | Buffer,
  metadata?: Record<string, string>
): Promise<{ bucket: string; key: string }> {
  const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;

  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: S3_CONTENT_TYPE, // 'application/jose'
    Metadata: metadata
  });

  await s3Client.send(command);

  return {
    bucket: config.S3_BUCKET_NAME,
    key
  };
}

/**
 * Generate a pre-signed URL for downloading a file
 * URLs expire after 1 hour (3600 seconds)
 *
 * @param key - S3 object key
 * @returns Pre-signed URL valid for 1 hour
 */
export async function generateSignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.S3_BUCKET_NAME,
    Key: key
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: S3_PRESIGNED_URL_EXPIRY // 3600 seconds
  });

  return url;
}

/**
 * Delete a file from S3
 *
 * @param key - S3 object key
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: config.S3_BUCKET_NAME,
    Key: key
  });

  await s3Client.send(command);
}

/**
 * Delete all files associated with an SHL
 * Deletes the entire folder for the manifest
 *
 * @param manifestId - The SHL manifest ID
 * @param fileIds - Array of file IDs to delete
 */
export async function deleteShlFiles(
  manifestId: string,
  fileIds: string[]
): Promise<void> {
  const deletePromises = fileIds.map(fileId => {
    const key = generateS3Key(manifestId, fileId);
    return deleteFile(key);
  });

  await Promise.all(deletePromises);
}

/**
 * Check if a file exists in S3
 *
 * @param key - S3 object key
 * @returns True if file exists, false otherwise
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    // NotFound error means file doesn't exist
    if ((error as Error).name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Upload a FHIR bundle for an SHL
 * The bundle contains Patient and DocumentReference resources
 *
 * @param manifestId - The SHL manifest ID
 * @param encryptedBundle - JWE-encrypted FHIR bundle
 * @returns S3 key for the uploaded bundle
 */
export async function uploadBundle(
  manifestId: string,
  encryptedBundle: string
): Promise<string> {
  const key = generateS3Key(manifestId, 'bundle');

  await uploadEncryptedFile(key, encryptedBundle, {
    'x-shl-type': 'bundle'
  });

  return key;
}

/**
 * Upload an encrypted document for an SHL
 *
 * @param manifestId - The SHL manifest ID
 * @param documentId - Document identifier
 * @param encryptedContent - JWE-encrypted document content
 * @param originalContentType - Original MIME type of the document
 * @returns S3 key for the uploaded document
 */
export async function uploadDocument(
  manifestId: string,
  documentId: string,
  encryptedContent: string,
  originalContentType: string
): Promise<string> {
  const key = generateS3Key(manifestId, `doc-${documentId}`);

  await uploadEncryptedFile(key, encryptedContent, {
    'x-shl-type': 'document',
    'x-original-content-type': originalContentType
  });

  return key;
}

/**
 * Get the S3 client for direct operations if needed
 * Generally prefer using the higher-level functions above
 */
export function getS3Client(): S3Client {
  return s3Client;
}
