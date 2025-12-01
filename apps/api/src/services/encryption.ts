/**
 * Encryption Service for SMART Health Links
 *
 * Implements JWE encryption per SHL specification:
 * - Algorithm: dir (direct encryption)
 * - Encryption: A256GCM (AES-256-GCM)
 * - Key size: 256 bits (32 bytes)
 * - Compression: Optional DEFLATE (zip: DEF) - not used by default
 *
 * Based on: https://docs.smarthealthit.org/smart-health-links/spec
 */

import * as jose from 'jose';
import pako from 'pako';
import { SHL_KEY_LENGTH, SHL_KEY_BASE64URL_LENGTH } from '@myhealthurl/shared';

// Alias for clarity in code
const SHL_KEY_BYTES = SHL_KEY_LENGTH;

/**
 * Generate a cryptographically secure SHL key
 * @returns Object containing raw key bytes and base64url-encoded key
 */
export function generateShlKey(): { key: Uint8Array; keyBase64Url: string } {
  const key = crypto.getRandomValues(new Uint8Array(SHL_KEY_BYTES));
  const keyBase64Url = jose.base64url.encode(key);

  // Validate key length (should be 43 chars for 32 bytes)
  if (keyBase64Url.length !== SHL_KEY_BASE64URL_LENGTH) {
    throw new Error(`Invalid key length: expected ${SHL_KEY_BASE64URL_LENGTH}, got ${keyBase64Url.length}`);
  }

  return { key, keyBase64Url };
}

/**
 * Generate a manifest ID with 256 bits of entropy
 * Used as the unique identifier for SHL manifest URLs
 * @returns Base64url-encoded manifest ID (43 characters)
 */
export function generateManifestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SHL_KEY_BYTES));
  return jose.base64url.encode(bytes);
}

/**
 * Encrypt content using JWE per SHL specification
 * Following the spec example: https://docs.smarthealthit.org/smart-health-links/spec
 *
 * @param content - Raw content to encrypt (Uint8Array)
 * @param key - 256-bit encryption key
 * @param contentType - MIME type of the content (stored in cty header)
 * @returns JWE compact serialization string
 */
export async function encryptContent(
  content: Uint8Array,
  key: Uint8Array,
  contentType: string
): Promise<string> {
  // Validate key size
  if (key.length !== SHL_KEY_BYTES) {
    throw new Error(`Invalid key size: expected ${SHL_KEY_BYTES} bytes, got ${key.length}`);
  }

  // Create JWE with direct encryption and A256GCM
  // Per spec example: alg: 'dir', enc: 'A256GCM', cty: contentType
  const jwe = await new jose.CompactEncrypt(content)
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
      cty: contentType
    })
    .encrypt(key);

  return jwe;
}

/**
 * Decrypt JWE content and decompress if needed
 * Supports both compressed (zip: DEF) and uncompressed JWE
 *
 * @param jwe - JWE compact serialization string
 * @param key - 256-bit decryption key
 * @returns Object containing decrypted content and content type
 */
export async function decryptContent(
  jwe: string,
  key: Uint8Array
): Promise<{ content: Uint8Array; contentType: string }> {
  // Validate key size
  if (key.length !== SHL_KEY_BYTES) {
    throw new Error(`Invalid key size: expected ${SHL_KEY_BYTES} bytes, got ${key.length}`);
  }

  // Decrypt JWE with optional DEFLATE decompression support
  // Per spec: use inflateRaw option to handle zip: DEF header
  const { plaintext, protectedHeader } = await jose.compactDecrypt(jwe, key, {
    inflateRaw: async (bytes: Uint8Array) => pako.inflateRaw(bytes)
  });

  return {
    content: new Uint8Array(plaintext),
    contentType: protectedHeader.cty as string
  };
}

/**
 * Decode a base64url-encoded key to Uint8Array
 *
 * @param keyBase64Url - Base64url-encoded key string
 * @returns Raw key bytes
 */
export function decodeKey(keyBase64Url: string): Uint8Array {
  const key = jose.base64url.decode(keyBase64Url);

  if (key.length !== SHL_KEY_BYTES) {
    throw new Error(`Invalid key size: expected ${SHL_KEY_BYTES} bytes, got ${key.length}`);
  }

  return key;
}

/**
 * Encrypt a string (e.g., JSON) to JWE
 * Convenience wrapper around encryptContent
 *
 * @param text - String content to encrypt
 * @param key - 256-bit encryption key
 * @param contentType - MIME type (defaults to application/json)
 * @returns JWE compact serialization string
 */
export async function encryptString(
  text: string,
  key: Uint8Array,
  contentType = 'application/json'
): Promise<string> {
  const content = new TextEncoder().encode(text);
  return encryptContent(content, key, contentType);
}

/**
 * Decrypt JWE to a string
 * Convenience wrapper around decryptContent
 *
 * @param jwe - JWE compact serialization string
 * @param key - 256-bit decryption key
 * @returns Object containing decrypted text and content type
 */
export async function decryptString(
  jwe: string,
  key: Uint8Array
): Promise<{ text: string; contentType: string }> {
  const { content, contentType } = await decryptContent(jwe, key);
  return {
    text: new TextDecoder().decode(content),
    contentType
  };
}

/**
 * Encrypt access token for storage at rest
 * Uses the server's ENCRYPTION_KEY from environment
 *
 * @param token - Access token to encrypt
 * @param encryptionKey - Server encryption key (32 bytes)
 * @returns Encrypted token as Buffer for database storage
 */
export async function encryptTokenForStorage(
  token: string,
  encryptionKey: Uint8Array
): Promise<Buffer> {
  const jwe = await encryptString(token, encryptionKey, 'text/plain');
  return Buffer.from(jwe, 'utf-8');
}

/**
 * Decrypt access token from storage
 *
 * @param encryptedToken - Encrypted token from database
 * @param encryptionKey - Server encryption key (32 bytes)
 * @returns Decrypted access token
 */
export async function decryptTokenFromStorage(
  encryptedToken: Buffer,
  encryptionKey: Uint8Array
): Promise<string> {
  const jwe = encryptedToken.toString('utf-8');
  const { text } = await decryptString(jwe, encryptionKey);
  return text;
}
