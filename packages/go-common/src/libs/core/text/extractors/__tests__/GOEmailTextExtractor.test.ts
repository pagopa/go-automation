import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOEmailTextExtractor } from '../GOEmailTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';

const SAMPLE_PLAIN_EML = [
  'From: sender@example.com',
  'To: recipient@example.com',
  'Subject: hello world',
  'Date: Mon, 01 Jan 2024 10:00:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'this is the email body with a keyword: orchestration.',
].join('\r\n');

const SAMPLE_HTML_EML = [
  'From: sender@example.com',
  'To: recipient@example.com',
  'Subject: html only',
  'Date: Mon, 01 Jan 2024 10:00:00 +0000',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><p>Hello&nbsp;<b>world</b></p><script>alert(1)</script></body></html>',
].join('\r\n');

describe('GOEmailTextExtractor', () => {
  const extractor = new GOEmailTextExtractor();

  it('declares rfc822 MIME and common extensions', () => {
    assert.ok(extractor.supportedMimeTypes.has('message/rfc822'));
    assert.ok(extractor.supportedExtensions.has('.eml'));
  });

  it('extracts headers and body from a plain text EML', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-eml-extractor-'));
    const file = path.join(dir, 'plain.eml');
    try {
      await fs.writeFile(file, SAMPLE_PLAIN_EML);
      const result = await extractor.extract(file);
      assert.match(result.text, /From: sender@example\.com/);
      assert.match(result.text, /Subject: hello world/);
      assert.match(result.text, /keyword: orchestration/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to HTML→text conversion stripping scripts', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-eml-extractor-'));
    const file = path.join(dir, 'html.eml');
    try {
      await fs.writeFile(file, SAMPLE_HTML_EML);
      const result = await extractor.extract(file);
      assert.match(result.text, /Hello\s+world/);
      // Scripts must be dropped — neither the tag nor the body should appear.
      assert.doesNotMatch(result.text, /alert/);
      assert.doesNotMatch(result.text, /<script/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('throws GOTextExtractionError on a missing file', async () => {
    await assert.rejects(
      extractor.extract('/nonexistent/path/file.eml'),
      (err) => err instanceof GOTextExtractionError && /Failed to read EML/.test(err.message),
    );
  });
});
