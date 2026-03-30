import { createHash } from 'crypto';

/**
 * Generate a fingerprint for a trend topic title.
 * Uses SHA-256 hash of normalized title (lowercase, CJK-aware, alphanumeric only).
 * Returns first 16 hex characters (64 bits) — collision-safe for <100k entries.
 */
export function generateFingerprint(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '') // Keep only letters and numbers (supports CJK)
    .trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
