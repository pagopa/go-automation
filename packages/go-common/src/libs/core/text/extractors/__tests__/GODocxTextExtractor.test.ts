import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GODocxTextExtractor } from '../GODocxTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';
import { GOTextExtractorRegistry } from '../../GOTextExtractorRegistry.js';

const DOCX_WITH_TEXT = Buffer.from(
  [
    'UEsDBAoAAAAIAAAAIVB5bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPL',
    'ETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCC',
    'uZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZX',
    'SnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjp',
    'L49zD99QSwMECgAAAAgAAAAhUJv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB',
    '7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFD',
    'Cm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3',
    'e7yCzwpuarF5sXUEsDBAoAAAAIAAAAIVBNZ2GrqAAAAOAAAAARAAAAd29yZC9kb2N1bWVudC54bWxFjk0LwjAMhv9K6d11',
    'ehAZ+zgoXhVR8FrbuA3WpDTVuX/vOg9enpA34eEtm48bxBsC94SVXGe5FICGbI9tJW/X42onBUeNVg+EUMkJWDZ1ORaW',
    'zMsBRjELkIuxkl2MvlCKTQdOc0YecL49KTgd5zW0aqRgfSADzLPfDWqT51vldI8yKR9kpzR9QkiI9QVQO7DicNrfS5WSx',
    'LBw+WMw8RzUEvwE6l+u/gJQSwECHgMKAAAACAAAACFQeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAtIEAAAAAW0NvbnRlbn',
    'RfVHlwZXNdLnhtbFBLAQIeAwoAAAAIAAAAIVCb/TfqrQAAACkBAAALAAAAAAAAAAAAAAC0gRkBAABfcmVscy8ucmVsc1BL',
    'AQIeAwoAAAAIAAAAIVBNZ2GrqAAAAOAAAAARAAAAAAAAAAAAAAC0ge8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAw',
    'ADALkAAADGAgAAAAA=',
  ].join(''),
  'base64',
);

const COMPOUND_FILE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

describe('GODocxTextExtractor', () => {
  const extractor = new GODocxTextExtractor();

  it('declares DOCX plus ambiguous legacy Word metadata as candidate formats', () => {
    assert.deepStrictEqual(
      [...extractor.supportedMimeTypes],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
    );
    assert.deepStrictEqual([...extractor.supportedExtensions], ['.docx', '.doc']);
  });

  it('extracts a real DOCX renamed to .doc through extension fallback', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-docx-extractor-'));
    const file = path.join(dir, 'renamed.doc');
    try {
      await fs.writeFile(file, DOCX_WITH_TEXT);
      const registry = new GOTextExtractorRegistry();
      registry.register(extractor);

      const result = await registry.extract('application/octet-stream', file);

      assert.strictEqual(result.text.trim(), 'Renamed DOCX');
      assert.strictEqual(result.truncated, false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a genuine binary .doc with an explicit unsupported-format error', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-docx-extractor-'));
    const file = path.join(dir, 'legacy.doc');
    try {
      await fs.writeFile(file, Buffer.concat([COMPOUND_FILE_SIGNATURE, Buffer.alloc(32)]));

      await assert.rejects(
        extractor.extract(file),
        (error) =>
          error instanceof GOTextExtractionError &&
          error.mimeType === 'application/msword' &&
          /Unsupported binary Word document/.test(error.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a non-DOCX ZIP even if it is named .doc', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-docx-extractor-'));
    const file = path.join(dir, 'spreadsheet.doc');
    try {
      await fs.copyFile(path.join(FIXTURES_DIR, 'sample.xlsx'), file);

      await assert.rejects(
        extractor.extract(file),
        (error) => error instanceof GOTextExtractionError && /ZIP archive is not a DOCX document/.test(error.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('throws GOTextExtractionError on a malformed DOCX', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-docx-extractor-'));
    const file = path.join(dir, 'bad.docx');
    try {
      await fs.writeFile(file, Buffer.from('not a docx file'));
      await assert.rejects(
        extractor.extract(file),
        (error) => error instanceof GOTextExtractionError && /File is not a valid DOCX package/.test(error.message),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
