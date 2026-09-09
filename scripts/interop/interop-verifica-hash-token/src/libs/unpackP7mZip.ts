import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import type * as forgeModule from 'node-forge';
import { Open } from 'unzipper-esm';

import { isForgeByteBuffer } from './isForgeByteBuffer.js';

const requireCjs = createRequire(import.meta.url);
const forge = requireCjs('node-forge') as typeof forgeModule;

/**
 * Recursively extracts binary string from ASN.1 nodes or values
 */
function extractStringFromAsn1(asn1Node: unknown): string {
  if (!asn1Node || typeof asn1Node !== 'object') {
    return '';
  }
  const node = asn1Node as { value?: unknown };
  if (typeof node.value === 'string') {
    return node.value;
  }
  if (Array.isArray(node.value)) {
    return node.value.map((child: unknown) => extractStringFromAsn1(child)).join('');
  }
  return '';
}

/**
 * Decrypts a p7m signed file to zip using node-forge and extracts it using unzipper-esm
 */
export async function unpackP7mZip(p7mPath: string, tempZipPath: string, outputDir: string): Promise<string> {
  // 1. Extract PKCS#7 content using node-forge
  let extractedContent: Buffer;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dynamic p7m path is required
    const p7mBuffer = fs.readFileSync(p7mPath);
    const forgeBuffer = forge.util.createBuffer(p7mBuffer.toString('binary'));
    const asn1 = forge.asn1.fromDer(forgeBuffer);
    const p7 = forge.pkcs7.messageFromAsn1(asn1);

    let contentBuf: Buffer | undefined;
    if (typeof p7.content === 'string' && p7.content.length > 0) {
      contentBuf = Buffer.from(p7.content, 'binary');
    } else if (isForgeByteBuffer(p7.content)) {
      const bytesStr = p7.content.getBytes();
      if (bytesStr.length > 0) {
        contentBuf = Buffer.from(bytesStr, 'binary');
      }
    }

    if (!contentBuf) {
      const rawCapture = (p7 as unknown as { rawCapture?: { content?: unknown } }).rawCapture;
      if (rawCapture?.content) {
        const binaryString = extractStringFromAsn1(rawCapture.content);
        if (binaryString.length > 0) {
          contentBuf = Buffer.from(binaryString, 'binary');
        }
      }
    }

    if (!contentBuf) {
      throw new Error('Unable to extract content from PKCS#7 message');
    }

    extractedContent = contentBuf;

    // eslint-disable-next-line no-restricted-syntax, security/detect-non-literal-fs-filename -- writing decrypted binary zip file to output path
    fs.writeFileSync(tempZipPath, extractedContent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error extracting PKCS#7 content with node-forge: ${message}`, { cause: error });
  }

  // 2. Unzip using unzipper-esm
  try {
    const directory = await Open.buffer(extractedContent);
    const ndjsonFiles = directory.files.filter((e) => e.type === 'File' && e.path.toLowerCase().endsWith('.ndjson'));

    const targetFile = ndjsonFiles[0];
    if (ndjsonFiles.length === 0 || !targetFile) {
      throw new Error(`No .ndjson files found inside the decrypted zip archive: ${tempZipPath}`);
    }
    if (ndjsonFiles.length > 1) {
      throw new Error(`Multiple .ndjson files found inside the decrypted zip archive: ${tempZipPath}`);
    }

    const filename = path.basename(targetFile.path);
    const extractedFilePath = path.join(outputDir, `extracted_${filename}`);
    const fileBuffer = await targetFile.buffer();

    // eslint-disable-next-line no-restricted-syntax, security/detect-non-literal-fs-filename -- writing extracted zip entry to output path
    fs.writeFileSync(extractedFilePath, fileBuffer);

    return extractedFilePath;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error extracting zip archive: ${message}`, { cause: error });
  }
}
