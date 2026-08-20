import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import type AdmZipModule from 'adm-zip';
//import type forgeModule from 'node-forge';

import { isForgeByteBuffer } from './isForgeByteBuffer.js';

const requireCjs = createRequire(import.meta.url);

const AdmZip = requireCjs('adm-zip') as new (fileName?: string | Buffer) => AdmZipModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- CJS module import in ESM
const forge = requireCjs('node-forge');

/**
 * Decrypts a p7m signed file to zip using node-forge and extracts it
 */
export function unpackP7mZip(p7mPath: string, tempZipPath: string, outputDir: string): string {
  // 1. Extract PKCS#7 content using node-forge
  try {
    const p7mBuffer = fs.readFileSync(p7mPath);
    const forgeBuffer = forge.util.createBuffer(p7mBuffer.toString('binary'));
    const asn1 = forge.asn1.fromDer(forgeBuffer);
    const p7 = forge.pkcs7.messageFromAsn1(asn1);

    let extractedContent: Buffer;
    if (typeof p7.content === 'string') {
      extractedContent = Buffer.from(String(p7.content), 'binary');
    } else if (isForgeByteBuffer(p7.content)) {
      extractedContent = Buffer.from(String(p7.content.getBytes()), 'binary');
    } else {
      throw new Error('Unable to extract content from PKCS#7 message');
    }

    // eslint-disable-next-line no-restricted-syntax -- writing decrypted binary zip file to output path
    fs.writeFileSync(tempZipPath, extractedContent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error extracting PKCS#7 content with node-forge: ${message}`, { cause: error });
  }

  // 2. Unzip using adm-zip
  try {
    const zip = new AdmZip(tempZipPath);
    const entries = zip.getEntries();
    const firstEntry = entries[0];
    if (entries.length === 0 || !firstEntry) {
      throw new Error(`No files found inside the decrypted zip archive: ${tempZipPath}`);
    }

    zip.extractAllTo(outputDir, true);
    return path.join(outputDir, firstEntry.entryName);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error extracting zip archive: ${message}`, { cause: error });
  }
}
