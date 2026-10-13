import { calculateFileHash } from './calculateFileHash.js';

export interface FileHashes {
  readonly hashExtracted: string;
  readonly hashOriginal: string;
}

/** A failed comparison must fail the script rather than report completion. */
export async function verifyFileHashes(extractedPath: string, originalPath: string): Promise<FileHashes> {
  const [hashExtracted, hashOriginal] = await Promise.all([
    calculateFileHash(extractedPath),
    calculateFileHash(originalPath),
  ]);
  if (hashExtracted !== hashOriginal) {
    throw new Error(
      `Hash verification failed! The token contents differ. Extracted SHA-256: ${hashExtracted}; original SHA-256: ${hashOriginal}`,
    );
  }
  return { hashExtracted, hashOriginal };
}
