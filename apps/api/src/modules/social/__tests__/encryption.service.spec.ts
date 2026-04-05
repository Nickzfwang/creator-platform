import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption.service';

describe('EncryptionService', () => {
  const TEST_KEY_HEX = 'a'.repeat(64); // 32-byte key
  const PREVIOUS_KEY_HEX = 'b'.repeat(64);

  function createService(overrides: Record<string, string | undefined> = {}) {
    const configMap: Record<string, string | undefined> = {
      ENCRYPTION_KEY: TEST_KEY_HEX,
      ENCRYPTION_KEY_PREVIOUS: undefined,
      ...overrides,
    };
    const mockConfig = { get: jest.fn((key: string) => configMap[key]) };
    return new EncryptionService(mockConfig as unknown as ConfigService);
  }

  describe('encrypt / decrypt roundtrip', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const service = createService();
      const plaintext = 'my-secret-token-12345';
      const encrypted = service.encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const service = createService();
      const plaintext = 'same-input';
      const a = service.encrypt(plaintext);
      const b = service.encrypt(plaintext);
      expect(a).not.toBe(b);
    });

    it('should handle empty string', () => {
      const service = createService();
      const encrypted = service.encrypt('');
      expect(service.decrypt(encrypted)).toBe('');
    });

    it('should handle unicode / CJK characters', () => {
      const service = createService();
      const plaintext = '中文密鑰🔑日本語テスト';
      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });

    it('should handle very long strings', () => {
      const service = createService();
      const plaintext = 'x'.repeat(10000);
      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });
  });

  describe('key rotation (previousKey fallback)', () => {
    it('should decrypt with previous key when current key fails', () => {
      const oldService = createService({ ENCRYPTION_KEY: PREVIOUS_KEY_HEX });
      const encrypted = oldService.encrypt('rotated-token');

      const newService = createService({
        ENCRYPTION_KEY: TEST_KEY_HEX,
        ENCRYPTION_KEY_PREVIOUS: PREVIOUS_KEY_HEX,
      });
      expect(newService.decrypt(encrypted)).toBe('rotated-token');
    });

    it('should prefer current key over previous key', () => {
      const service = createService({
        ENCRYPTION_KEY: TEST_KEY_HEX,
        ENCRYPTION_KEY_PREVIOUS: PREVIOUS_KEY_HEX,
      });
      const encrypted = service.encrypt('current-key-token');
      // Should decrypt with current key without needing previous
      expect(service.decrypt(encrypted)).toBe('current-key-token');
    });

    it('should throw when neither key can decrypt', () => {
      const service = createService({
        ENCRYPTION_KEY: TEST_KEY_HEX,
        ENCRYPTION_KEY_PREVIOUS: PREVIOUS_KEY_HEX,
      });
      expect(() => service.decrypt('aW52YWxpZC1kYXRh')).toThrow();
    });
  });

  describe('fallback key (no ENCRYPTION_KEY)', () => {
    it('should use fallback key when ENCRYPTION_KEY is not set', () => {
      const service = createService({ ENCRYPTION_KEY: undefined });
      const encrypted = service.encrypt('dev-token');
      expect(service.decrypt(encrypted)).toBe('dev-token');
    });
  });

  describe('error handling', () => {
    it('should throw on tampered ciphertext', () => {
      const service = createService();
      const encrypted = service.encrypt('test');
      // Tamper with the base64
      const tampered = encrypted.slice(0, -4) + 'XXXX';
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw on wrong key without previousKey', () => {
      const serviceA = createService({ ENCRYPTION_KEY: TEST_KEY_HEX });
      const encrypted = serviceA.encrypt('secret');

      const serviceB = createService({ ENCRYPTION_KEY: 'c'.repeat(64) });
      expect(() => serviceB.decrypt(encrypted)).toThrow('Failed to decrypt token');
    });
  });
});
