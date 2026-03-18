import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  private readonly previousKey: Buffer | null;

  constructor(private readonly config: ConfigService) {
    const keyHex = this.config.get<string>('ENCRYPTION_KEY');
    if (!keyHex) {
      this.logger.warn(
        'ENCRYPTION_KEY not set — token encryption will use a fallback key. Set ENCRYPTION_KEY in production!',
      );
    }

    this.key = keyHex
      ? Buffer.from(keyHex, 'hex')
      : Buffer.from('0'.repeat(64), 'hex'); // 32-byte fallback for dev

    const previousKeyHex = this.config.get<string>('ENCRYPTION_KEY_PREVIOUS');
    this.previousKey = previousKeyHex
      ? Buffer.from(previousKeyHex, 'hex')
      : null;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  decrypt(encryptedBase64: string): string {
    try {
      return this.decryptWithKey(encryptedBase64, this.key);
    } catch {
      if (this.previousKey) {
        this.logger.debug('Decryption with current key failed, trying previous key');
        return this.decryptWithKey(encryptedBase64, this.previousKey);
      }
      throw new Error('Failed to decrypt token');
    }
  }

  private decryptWithKey(encryptedBase64: string, key: Buffer): string {
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
