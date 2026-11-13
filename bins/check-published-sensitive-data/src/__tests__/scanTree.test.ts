import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { compileScanRules } from '../scanText.js';
import { decodeText, scanTree } from '../scanTree.js';
import { CONFIG, DECOY_ACCOUNT_ID } from './fixtures.js';

const TEXT = `Account ${DECOY_ACCOUNT_ID}`;

describe('decodeText', () => {
  it('decodes UTF-8 with and without BOM', () => {
    assert.strictEqual(decodeText(Buffer.from(TEXT)), TEXT);
    assert.strictEqual(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(TEXT)])), TEXT);
  });

  it('decodes UTF-16 little and big endian, with and without BOM', () => {
    const le = Buffer.from(TEXT, 'utf16le');
    const be = Buffer.from(le).swap16();
    assert.strictEqual(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), le])), TEXT);
    assert.strictEqual(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), TEXT);
    assert.strictEqual(decodeText(le), TEXT);
    assert.strictEqual(decodeText(be), TEXT);
  });

  it('decodes UTF-32 with BOM, never mistaking its little-endian BOM for UTF-16', () => {
    const codePoints = [...TEXT].map((character) => character.codePointAt(0) ?? 0);
    const le = Buffer.alloc(4 * (codePoints.length + 1));
    const be = Buffer.alloc(4 * (codePoints.length + 1));
    le.writeUInt32LE(0xfeff, 0);
    be.writeUInt32BE(0xfeff, 0);
    for (const [index, codePoint] of codePoints.entries()) {
      le.writeUInt32LE(codePoint, 4 * (index + 1));
      be.writeUInt32BE(codePoint, 4 * (index + 1));
    }
    assert.strictEqual(decodeText(le), TEXT);
    assert.strictEqual(decodeText(be), TEXT);
  });

  it('decodes a UTF-32 document far larger than the argument limit of a single call', () => {
    const size = 1_000_000;
    const content = Buffer.alloc(4 * (size + 1));
    content.writeUInt32LE(0xfeff, 0);
    for (let index = 1; index <= size; index += 1) content.writeUInt32LE(0x61, 4 * index);
    const text = decodeText(content);
    assert.strictEqual(text?.length, size);
  });

  it('rejects a decoding that leaves NUL characters in the text', () => {
    // UTF-16LE BOM followed by UTF-32-like content: the UTF-16 reading is full of NULs.
    assert.strictEqual(decodeText(Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x00, 0x00, 0x42, 0x00])), undefined);
  });

  it('treats other NUL-bearing content as binary', () => {
    assert.strictEqual(decodeText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01, 0x00, 0x02])), undefined);
  });
});

describe('scanTree — encodings', () => {
  it('scans a UTF-16 README and reports a binary file with a text extension, skipping real binaries', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-tree-test-'));
    try {
      await fs.writeFile(path.join(root, 'README.md'), Buffer.from(TEXT, 'utf16le'));
      const utf32 = Buffer.alloc(4 * (TEXT.length + 1));
      utf32.writeUInt32LE(0xfeff, 0);
      for (const [index, character] of [...TEXT].entries()) {
        utf32.writeUInt32LE(character.codePointAt(0) ?? 0, 4 * (index + 1));
      }
      await fs.writeFile(path.join(root, 'NOTES.md'), utf32);
      await fs.writeFile(path.join(root, 'broken.js'), Buffer.from([0x00, 0x01, 0x02, 0x00, 0x00]));
      await fs.writeFile(path.join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01]));
      const findings = await scanTree(root, {
        rules: compileScanRules(CONFIG, '@pagopa/one'),
        forbiddenPathSegments: [],
        forbiddenSuffixes: [],
      });
      assert.deepStrictEqual(
        findings.map((finding) => `${finding.file} ${finding.rule}`),
        ['NOTES.md account-id', 'README.md account-id', 'broken.js unscannable-file'],
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
