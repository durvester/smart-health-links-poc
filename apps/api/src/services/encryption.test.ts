import { describe, it, expect } from 'vitest';
import {
  generateShlKey,
  generateManifestId,
  encryptContent,
  decryptContent,
  decodeKey,
  encryptString,
  decryptString,
  encryptTokenForStorage,
  decryptTokenFromStorage
} from './encryption.js';
import { SHL_KEY_LENGTH, SHL_KEY_BASE64URL_LENGTH } from '@myhealthurl/shared';

const SHL_KEY_BYTES = SHL_KEY_LENGTH;

describe('Encryption Service', () => {
  describe('generateShlKey', () => {
    it('should generate a 32-byte key', () => {
      const { key, keyBase64Url } = generateShlKey();
      expect(key.length).toBe(SHL_KEY_BYTES);
      expect(keyBase64Url.length).toBe(SHL_KEY_BASE64URL_LENGTH);
    });

    it('should generate unique keys each time', () => {
      const { keyBase64Url: key1 } = generateShlKey();
      const { keyBase64Url: key2 } = generateShlKey();
      expect(key1).not.toBe(key2);
    });

    it('should produce valid base64url encoding', () => {
      const { keyBase64Url } = generateShlKey();
      // base64url uses only A-Z, a-z, 0-9, -, _
      expect(keyBase64Url).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('generateManifestId', () => {
    it('should generate a 43-character ID', () => {
      const id = generateManifestId();
      expect(id.length).toBe(SHL_KEY_BASE64URL_LENGTH);
    });

    it('should generate unique IDs each time', () => {
      const id1 = generateManifestId();
      const id2 = generateManifestId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('encryptContent / decryptContent', () => {
    it('should encrypt and decrypt binary content', async () => {
      const { key } = generateShlKey();
      const originalContent = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const contentType = 'application/octet-stream';

      const jwe = await encryptContent(originalContent, key, contentType);
      const { content, contentType: decryptedType } = await decryptContent(jwe, key);

      expect(content).toEqual(originalContent);
      expect(decryptedType).toBe(contentType);
    });

    it('should encrypt and decrypt text content', async () => {
      const { key } = generateShlKey();
      const originalText = 'Hello, World! This is a test message.';
      const originalContent = new TextEncoder().encode(originalText);
      const contentType = 'text/plain';

      const jwe = await encryptContent(originalContent, key, contentType);
      const { content } = await decryptContent(jwe, key);

      const decryptedText = new TextDecoder().decode(content);
      expect(decryptedText).toBe(originalText);
    });

    it('should handle large content', async () => {
      const { key } = generateShlKey();
      const largeContent = new TextEncoder().encode('A'.repeat(10000));
      const contentType = 'text/plain';

      const jwe = await encryptContent(largeContent, key, contentType);
      const { content } = await decryptContent(jwe, key);

      expect(content).toEqual(largeContent);
    });

    it('should handle JSON content', async () => {
      const { key } = generateShlKey();
      const jsonContent = JSON.stringify({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: { resourceType: 'Patient' } }]
      });
      const originalContent = new TextEncoder().encode(jsonContent);
      const contentType = 'application/json';

      const jwe = await encryptContent(originalContent, key, contentType);
      const { content, contentType: decryptedType } = await decryptContent(jwe, key);

      const decryptedText = new TextDecoder().decode(content);
      expect(decryptedText).toBe(jsonContent);
      expect(decryptedType).toBe(contentType);
    });

    it('should produce valid JWE format', async () => {
      const { key } = generateShlKey();
      const content = new Uint8Array([1, 2, 3]);

      const jwe = await encryptContent(content, key, 'application/octet-stream');

      // JWE compact serialization has 5 parts separated by dots
      const parts = jwe.split('.');
      expect(parts.length).toBe(5);
    });

    it('should fail decryption with wrong key', async () => {
      const { key: key1 } = generateShlKey();
      const { key: key2 } = generateShlKey();
      const content = new Uint8Array([1, 2, 3]);

      const jwe = await encryptContent(content, key1, 'application/octet-stream');

      await expect(decryptContent(jwe, key2)).rejects.toThrow();
    });

    it('should reject invalid key sizes', async () => {
      const shortKey = new Uint8Array(16);
      const content = new Uint8Array([1, 2, 3]);

      await expect(encryptContent(content, shortKey, 'application/octet-stream')).rejects.toThrow(
        /Invalid key size/
      );
    });
  });

  describe('decodeKey', () => {
    it('should decode a valid base64url key', () => {
      const { key, keyBase64Url } = generateShlKey();
      const decoded = decodeKey(keyBase64Url);
      // Compare as arrays since Buffer and Uint8Array are different types
      expect(Array.from(decoded)).toEqual(Array.from(key));
    });

    it('should reject invalid key lengths', () => {
      const shortKey = 'AAAAAAAAAAAAAAAAAAAAAA'; // Too short
      expect(() => decodeKey(shortKey)).toThrow(/Invalid key size/);
    });
  });

  describe('encryptString / decryptString', () => {
    it('should encrypt and decrypt strings', async () => {
      const { key } = generateShlKey();
      const original = 'Test string content';

      const jwe = await encryptString(original, key);
      const { text } = await decryptString(jwe, key);

      expect(text).toBe(original);
    });

    it('should use application/json as default content type', async () => {
      const { key } = generateShlKey();
      const original = '{"key": "value"}';

      const jwe = await encryptString(original, key);
      const { contentType } = await decryptString(jwe, key);

      expect(contentType).toBe('application/json');
    });
  });

  describe('encryptTokenForStorage / decryptTokenFromStorage', () => {
    it('should encrypt and decrypt tokens for storage', async () => {
      const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      const encrypted = await encryptTokenForStorage(token, encryptionKey);
      expect(encrypted).toBeInstanceOf(Buffer);

      const decrypted = await decryptTokenFromStorage(encrypted, encryptionKey);
      expect(decrypted).toBe(token);
    });
  });
});
