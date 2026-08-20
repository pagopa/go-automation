import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import type AdmZipModule from 'adm-zip';
import type * as forgeModule from 'node-forge';

import { isForgeByteBuffer } from './isForgeByteBuffer.js';

const requireCjs = createRequire(import.meta.url);

const AdmZip = requireCjs('adm-zip') as new (fileName?: string | Buffer) => AdmZipModule;
const forge = requireCjs('node-forge') as typeof forgeModule;

/**
 * Decrypts a p7m signed file to zip using node-forge and extracts it
 */
export function unpackP7mZip(p7mPath: string, tempZipPath: string, outputDir: string): string {
  // 1. Extract PKCS#7 content using node-forge
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dynamic p7m path is required
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

    // eslint-disable-next-line no-restricted-syntax, security/detect-non-literal-fs-filename -- writing decrypted binary zip file to output path
    fs.writeFileSync(tempZipPath, extractedContent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error extracting PKCS#7 content with node-forge: ${message}`, { cause: error });
  }

  // 2. Unzip using adm-zip
  try {
    const zip = new AdmZip(tempZipPath);
    const entries = zip.getEntries();

    const ndjsonEntries = entries.filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.ndjson'));
    const targetEntry = ndjsonEntries[0];
    if (ndjsonEntries.length === 0 || !targetEntry) {
      throw new Error(`No .ndjson files found inside the decrypted zip archive: ${tempZipPath}`);
    }
    if (ndjsonEntries.length > 1) {
      throw new Error(`Multiple .ndjson files found inside the decrypted zip archive: ${tempZipPath}`);
    }

    const extractedFilePath = path.join(outputDir, `extracted_${targetEntry.name}`);

    // eslint-disable-next-line no-restricted-syntax, security/detect-non-literal-fs-filename -- writing extracted zip entry to output path
    fs.writeFileSync(extractedFilePath, targetEntry.getData());

    return extractedFilePath;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error extracting zip archive: ${message}`, { cause: error });
  }
}
