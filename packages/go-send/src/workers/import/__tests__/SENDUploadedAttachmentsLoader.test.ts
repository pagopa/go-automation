import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { loadUploadedAttachments } from '../SENDUploadedAttachmentsLoader.js';

/**
 * Writes the given content to a temporary file and returns its path
 */
async function writeTempFile(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'send-uploaded-attachments-'));
  const filePath = path.join(dir, 'files-results.json');
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

function createRecord(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    filePath: '/inputs/01.pdf',
    pratica: 'PRA-001',
    status: 'uploaded',
    fileKey: 'PN_NOTIFICATION_ATTACHMENTS-key.pdf',
    versionToken: 'version-token',
    sha256: 'sha256-digest',
    fileSizeBytes: 1000,
    contentType: 'application/pdf',
    uploadedAt: '2026-06-10T12:00:00.000Z',
    error: '',
    ...overrides,
  };
}

describe('loadUploadedAttachments', () => {
  it('groups uploaded records by pratica and sorts each group by filePath', async () => {
    const filePath = await writeTempFile(
      JSON.stringify([
        createRecord({ filePath: '/inputs/02.pdf', pratica: 'PRA-001', fileKey: 'key-2' }),
        createRecord({ filePath: '/inputs/01.pdf', pratica: 'PRA-001', fileKey: 'key-1' }),
        createRecord({ filePath: '/inputs/03.pdf', pratica: 'PRA-002', fileKey: 'key-3' }),
      ]),
    );

    const result = await loadUploadedAttachments(filePath);

    assert.strictEqual(result.totalAttachments, 3);
    assert.strictEqual(result.skipped.length, 0);
    assert.strictEqual(result.attachmentsByPratica.size, 2);

    const group = result.attachmentsByPratica.get('PRA-001');
    assert.strictEqual(group?.length, 2);
    assert.strictEqual(group?.[0]?.fileKey, 'key-1');
    assert.strictEqual(group?.[1]?.fileKey, 'key-2');
    assert.strictEqual(group?.[0]?.versionToken, 'version-token');
    assert.strictEqual(group?.[0]?.sha256, 'sha256-digest');
    assert.strictEqual(result.attachmentsByPratica.get('PRA-002')?.length, 1);
  });

  it('skips failed and malformed records reporting the reason', async () => {
    const filePath = await writeTempFile(
      JSON.stringify([
        createRecord({}),
        createRecord({ filePath: '/inputs/02.pdf', status: 'failed', error: 'upload timeout' }),
        createRecord({ filePath: '/inputs/03.pdf', fileKey: '' }),
        'not-an-object',
      ]),
    );

    const result = await loadUploadedAttachments(filePath);

    assert.strictEqual(result.totalAttachments, 1);
    assert.strictEqual(result.skipped.length, 3);
    assert.match(result.skipped[0]?.reason ?? '', /Upload failed: upload timeout/);
    assert.match(result.skipped[1]?.reason ?? '', /Missing required fields/);
    assert.match(result.skipped[2]?.reason ?? '', /not an object/);
  });

  it('defaults contentType to application/pdf when missing', async () => {
    const filePath = await writeTempFile(JSON.stringify([createRecord({ contentType: '' })]));

    const result = await loadUploadedAttachments(filePath);

    assert.strictEqual(result.attachmentsByPratica.get('PRA-001')?.[0]?.contentType, 'application/pdf');
  });

  it('throws when the file does not contain a JSON array', async () => {
    const filePath = await writeTempFile(JSON.stringify({ foo: 'bar' }));

    await assert.rejects(loadUploadedAttachments(filePath), /expected a JSON array/);
  });

  it('throws when the file is not valid JSON', async () => {
    const filePath = await writeTempFile('not json');

    await assert.rejects(loadUploadedAttachments(filePath), /not valid JSON/);
  });
});
