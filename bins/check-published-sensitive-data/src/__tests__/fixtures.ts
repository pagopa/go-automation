import type { SensitiveDataConfig } from '../types/SensitiveDataConfig.js';

/** A fake, non-synthetic account id: the decoy every check must catch. */
export const DECOY_ACCOUNT_ID = '987654321098';

/** The repository rules, with one known profile name. */
export const CONFIG: SensitiveDataConfig = {
  allowedAccountIds: [
    { value: '000000000000', reason: 'synthetic' },
    { value: '123456789012', reason: 'AWS documentation' },
  ],
  profileNames: ['my-known-profile'],
  profilePrefixes: ['sso_'],
  forbiddenPathSegments: ['__tests__', '__baseline__'],
  forbiddenSuffixes: ['.tsbuildinfo'],
  exceptions: [],
};

/**
 * Encodes `text` as UTF-32 with a byte order mark.
 *
 * @param text - The text to encode
 * @param endian - Byte order of the code units
 * @returns The encoded bytes, BOM first
 */
export function utf32WithBom(text: string, endian: 'le' | 'be' = 'le'): Buffer {
  const codePoints = [0xfeff, ...[...text].map((character) => character.codePointAt(0) ?? 0)];
  const buffer = Buffer.alloc(4 * codePoints.length);
  for (const [index, codePoint] of codePoints.entries()) {
    if (endian === 'le') buffer.writeUInt32LE(codePoint, 4 * index);
    else buffer.writeUInt32BE(codePoint, 4 * index);
  }
  return buffer;
}
