import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOEmailTextExtractor } from '../GOEmailTextExtractor.js';
import { GOTextExtractionError } from '../../GOTextExtractionError.js';
import { writeTempFile } from '../../__tests__/tempFile.js';

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
  [
    '<html><head><style>.hidden { display: none }</style></head><body>',
    '<p>Hello&nbsp;<b>world</b> &amp; team</p>',
    '<script>alert(1)</script>',
    '<p>Second paragraph<br>Next line</p>',
    '</body></html>',
  ].join(''),
].join('\r\n');

describe('GOEmailTextExtractor', () => {
  const extractor = new GOEmailTextExtractor();

  it('extracts headers and body from a plain text EML', async (t) => {
    const result = await extractor.extract(await writeTempFile(t, 'plain.eml', SAMPLE_PLAIN_EML));
    assert.match(result.text, /From: sender@example\.com/);
    assert.match(result.text, /Subject: hello world/);
    assert.match(result.text, /keyword: orchestration/);
  });

  it('converts an HTML-only message to plain text', async (t) => {
    const result = await extractor.extract(await writeTempFile(t, 'html.eml', SAMPLE_HTML_EML));
    assert.match(result.text, /Hello world & team/);
    assert.match(result.text, /Second paragraph/);
    assert.match(result.text, /Next line/);
    assert.doesNotMatch(result.text, /alert/);
    assert.doesNotMatch(result.text, /display: none/);
    assert.doesNotMatch(result.text, /<script/i);
    assert.doesNotMatch(result.text, /<style/i);
  });

  it('throws GOTextExtractionError on a missing file', async () => {
    await assert.rejects(
      extractor.extract('/nonexistent/path/file.eml'),
      (err) => err instanceof GOTextExtractionError && /Failed to read EML/.test(err.message),
    );
  });
});
