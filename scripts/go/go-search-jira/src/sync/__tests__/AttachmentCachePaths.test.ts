import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { AttachmentCachePaths } from '../AttachmentCachePaths.js';
import type { JiraAttachment } from '../../types/JiraAttachment.js';

const ROOT = '/tmp/cache';

function attachment(overrides: Partial<JiraAttachment> = {}): JiraAttachment {
  return {
    id: '1001',
    filename: 'doc.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    created: '2026-01-01T00:00:00.000Z',
    contentUrl: 'https://example.invalid/x',
    author: 'tester',
    ...overrides,
  };
}

describe('AttachmentCachePaths', () => {
  const paths = new AttachmentCachePaths(ROOT);

  it('returns the cache root under the configured data directory', () => {
    assert.strictEqual(paths.attachmentsRoot(), path.join(ROOT, 'attachments'));
  });

  it('builds a deterministic issue directory', () => {
    assert.strictEqual(paths.issueDir('PN-1234'), path.join(ROOT, 'attachments', 'PN-1234'));
  });

  it('builds a deterministic attachment path', () => {
    assert.strictEqual(
      paths.attachmentPath('PN-1234', attachment({ id: '42', filename: 'file.pdf' })),
      path.join(ROOT, 'attachments', 'PN-1234', '42-file.pdf'),
    );
  });

  it('replaces unsafe characters with underscores', () => {
    const result = paths.issueDir('PN/../../etc/passwd');
    // No segment of the result should equal `..`
    for (const segment of result.split(path.sep)) {
      assert.notStrictEqual(segment, '..');
    }
    // The original path traversal characters must not be preserved as `..`.
    assert.doesNotMatch(result, /\/\.\.\//);
  });

  it('defuses a `..` issue key (path-traversal)', () => {
    const result = paths.issueDir('..');
    const root = paths.attachmentsRoot();
    // The result must remain a strict child of the cache root.
    assert.ok(result.startsWith(`${root}${path.sep}`), `expected ${result} to start with ${root}${path.sep}`);
    // The leaf segment must NOT be `..` (would escape the root via path.join).
    const leaf = result.slice(root.length + 1);
    assert.notStrictEqual(leaf, '..');
    assert.notStrictEqual(leaf, '.');
  });

  it('defuses a `.` issue key', () => {
    const result = paths.issueDir('.');
    const leaf = result.slice(paths.attachmentsRoot().length + 1);
    assert.notStrictEqual(leaf, '.');
    assert.notStrictEqual(leaf, '');
  });

  it('rewrites leading dots so hidden segments cannot reach the FS', () => {
    const result = paths.issueDir('.gitignore');
    const leaf = result.slice(paths.attachmentsRoot().length + 1);
    assert.ok(!leaf.startsWith('.'), `leaf "${leaf}" still starts with a dot`);
  });

  it('defuses a `..` attachment filename', () => {
    const result = paths.attachmentPath('PN-1', attachment({ id: '7', filename: '..' }));
    const dir = paths.issueDir('PN-1');
    // result = <dir>/7-<sanitised-name>
    const leaf = result.slice(dir.length + 1);
    assert.ok(leaf.startsWith('7-'));
    // The portion after `7-` must not be `..` or `.`.
    const name = leaf.slice('7-'.length);
    assert.notStrictEqual(name, '..');
    assert.notStrictEqual(name, '.');
  });

  it('caps segments at 200 characters', () => {
    const longKey = 'A'.repeat(500);
    const leaf = paths.issueDir(longKey).slice(paths.attachmentsRoot().length + 1);
    assert.ok(leaf.length <= 200, `leaf length ${leaf.length} exceeds 200`);
  });
});
