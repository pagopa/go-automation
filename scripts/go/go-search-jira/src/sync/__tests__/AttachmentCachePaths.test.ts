import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { AttachmentCachePaths } from '../AttachmentCachePaths.js';
import { makeAttachment } from '../../__tests__/helpers/jiraTestFixtures.js';

const ROOT = '/tmp/cache';
const ATTACHMENTS = path.join(ROOT, 'attachments');

describe('AttachmentCachePaths', () => {
  const paths = new AttachmentCachePaths(ROOT);

  it('builds deterministic paths under the attachments root', () => {
    assert.strictEqual(paths.attachmentsRoot(), ATTACHMENTS);
    assert.strictEqual(paths.issueDir('PN-1234'), path.join(ATTACHMENTS, 'PN-1234'));
    assert.strictEqual(
      paths.attachmentPath('PN-1234', makeAttachment({ id: '42', filename: 'file.pdf' })),
      path.join(ATTACHMENTS, 'PN-1234', '42-file.pdf'),
    );
  });

  // Every sanitised segment must stay a strict child of its parent: no `.`,
  // `..`, empty or hidden segment can reach `path.join`.
  const issueKeyCases: ReadonlyArray<readonly [string, string]> = [
    ['PN/../../etc/passwd', 'PN_.._.._etc_passwd'],
    ['..', '__'],
    ['.', '_'],
    ['.gitignore', '_gitignore'],
    ['', '_'],
    ['A'.repeat(500), 'A'.repeat(200)],
  ];

  for (const [issueKey, segment] of issueKeyCases) {
    it(`sanitises the issue key "${issueKey.slice(0, 24)}" to a safe segment`, () => {
      assert.strictEqual(paths.issueDir(issueKey), path.join(ATTACHMENTS, segment));
    });
  }

  it('defuses a `..` attachment filename', () => {
    assert.strictEqual(
      paths.attachmentPath('PN-1', makeAttachment({ id: '7', filename: '..' })),
      path.join(ATTACHMENTS, 'PN-1', '7-__'),
    );
  });
});
