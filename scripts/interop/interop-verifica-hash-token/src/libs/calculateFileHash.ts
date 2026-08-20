import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

/**
 * Calculates SHA-256 hash of a file using streams to be memory efficient
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dynamic file path is required
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}
