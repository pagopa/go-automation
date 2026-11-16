/**
 * DOCX text extractor backed by `mammoth`.
 *
 * Files advertised as legacy `.doc` / `application/msword` are accepted as
 * candidates because external systems sometimes mislabel DOCX attachments.
 * Their package structure is inspected before Mammoth is invoked: real DOCX
 * content is extracted regardless of the filename, while binary DOC files are
 * rejected explicitly because Mammoth cannot parse them.
 *
 * Uses `extractRawText` to produce plain text without HTML markup. Embedded
 * images are silently dropped.
 */
import * as fs from 'node:fs/promises';

import { Open } from 'unzipper-esm';

import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';

import { truncateText } from './truncateText.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LEGACY_DOC_MIME_TYPE = 'application/msword';

// OLE Compound File Binary signature used by classic .doc files. Encrypted
// OOXML documents use the same container and are also unsupported by Mammoth.
const COMPOUND_FILE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const REQUIRED_DOCX_PARTS: ReadonlySet<string> = new Set(['[Content_Types].xml', 'word/document.xml']);

const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set([DOCX_MIME_TYPE, LEGACY_DOC_MIME_TYPE]);

const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.docx', '.doc']);

export class GODocxTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    const signal = options?.signal;
    signal?.throwIfAborted();

    let fileBuffer: Buffer;
    try {
      // Mammoth loads the entire file too; retaining this buffer lets content
      // detection and extraction share one disk read.
      fileBuffer = await fs.readFile(filePath);
      signal?.throwIfAborted();
    } catch (error) {
      signal?.throwIfAborted();
      throw new GOTextExtractionError(`Failed to read Word document: ${filePath}`, filePath, undefined, error);
    }

    await assertDocxPackage(fileBuffer, filePath, signal);

    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      signal?.throwIfAborted();
      const { text, truncated } = truncateText(result.value, maxBytes);
      return { text, pages: undefined, truncated };
    } catch (error) {
      signal?.throwIfAborted();
      throw new GOTextExtractionError(`Failed to parse DOCX: ${filePath}`, filePath, DOCX_MIME_TYPE, error);
    }
  }
}

async function assertDocxPackage(fileBuffer: Buffer, filePath: string, signal?: AbortSignal): Promise<void> {
  if (fileBuffer.subarray(0, COMPOUND_FILE_SIGNATURE.length).equals(COMPOUND_FILE_SIGNATURE)) {
    throw new GOTextExtractionError(
      `Unsupported binary Word document: ${filePath}. Legacy .doc and encrypted Office containers cannot be parsed by Mammoth`,
      filePath,
      LEGACY_DOC_MIME_TYPE,
    );
  }

  let entries: ReadonlyArray<{ readonly path: string; readonly type: string }>;
  try {
    const archive = await Open.buffer(fileBuffer);
    signal?.throwIfAborted();
    entries = archive.files;
  } catch (error) {
    signal?.throwIfAborted();
    throw new GOTextExtractionError(`File is not a valid DOCX package: ${filePath}`, filePath, DOCX_MIME_TYPE, error);
  }

  const fileNames = new Set(entries.filter((entry) => entry.type === 'File').map((entry) => entry.path));
  const missingParts = [...REQUIRED_DOCX_PARTS].filter((part) => !fileNames.has(part));
  if (missingParts.length > 0) {
    throw new GOTextExtractionError(
      `ZIP archive is not a DOCX document: ${filePath}. Missing ${missingParts.join(', ')}`,
      filePath,
      DOCX_MIME_TYPE,
    );
  }
}
