import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSS3Service } from '../AWSS3Service.js';

/** Creates a private temporary directory, removed when the test ends. */
async function tempDir(t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-aws-s3-service-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

/** A GetObject response whose body is `text`. */
function objectWithBody(text: string): object {
  return { Body: { transformToByteArray: async () => Promise.resolve(new Uint8Array(Buffer.from(text))) } };
}

function serviceOf(client: FakeAwsClient): AWSS3Service {
  return new AWSS3Service(client.as<S3Client>());
}

describe('AWSS3Service', () => {
  it('uploads files with inferred content type and buffers with default content type', async (t) => {
    const filePath = path.join(await tempDir(t), 'payload.JSON');
    await fs.writeFile(filePath, '{"ok":true}', 'utf-8');
    const client = new FakeAwsClient(() => ({}));
    const service = serviceOf(client);

    assert.strictEqual(await service.uploadFile(filePath, 'bucket', 'payload.json'), 'payload.json');
    assert.strictEqual(await service.uploadBuffer(Buffer.from('raw'), 'bucket', 'raw.bin'), 'raw.bin');

    assert.deepStrictEqual(
      client.inputs(PutObjectCommand).map((input) => input['ContentType']),
      ['application/json', 'application/octet-stream'],
    );
  });

  it('uploads only direct files from a directory and returns an empty list when it cannot read the directory', async (t) => {
    const dir = await tempDir(t);
    await fs.writeFile(path.join(dir, 'a.txt'), 'alpha', 'utf-8');
    await fs.writeFile(path.join(dir, 'b.csv'), 'beta', 'utf-8');
    await fs.mkdir(path.join(dir, 'nested'));
    await fs.writeFile(path.join(dir, 'nested', 'ignored.txt'), 'ignored', 'utf-8');
    const client = new FakeAwsClient(() => ({}));
    const service = serviceOf(client);

    const keys = await service.uploadDirectory(dir, 'bucket', 'prefix');
    assert.deepStrictEqual(keys.sort(), ['prefix/a.txt', 'prefix/b.csv']);
    assert.strictEqual(client.commands.length, 2);

    assert.deepStrictEqual(await service.uploadDirectory(path.join(dir, 'missing'), 'bucket', 'prefix'), []);
  });

  it('downloads objects to memory and to local files, rejecting empty bodies', async (t) => {
    const outputPath = path.join(await tempDir(t), 'download.bin');
    const service = serviceOf(new FakeAwsClient([objectWithBody('payload'), objectWithBody('file body'), {}]));

    assert.deepStrictEqual(await service.downloadFile('bucket', 'key'), Buffer.from('payload'));
    assert.strictEqual(await service.downloadToFile('bucket', 'key', outputPath), outputPath);
    assert.strictEqual(await fs.readFile(outputPath, 'utf-8'), 'file body');
    await assert.rejects(service.downloadFile('bucket', 'missing'), /Empty response body/);
  });

  it('lists buckets while skipping unnamed entries and preserving creation dates', async () => {
    const creationDate = new Date('2026-06-01T10:00:00.000Z');
    const service = serviceOf(
      new FakeAwsClient([
        { Buckets: [{ Name: 'bucket-a', CreationDate: creationDate }, {}, { Name: 'bucket-b' }] },
        {},
      ]),
    );

    assert.deepStrictEqual(await service.listBuckets(), [{ name: 'bucket-a', creationDate }, { name: 'bucket-b' }]);
    assert.deepStrictEqual(await service.listBuckets(), []);
  });

  it('lists objects across pages while skipping unnamed entries', async () => {
    const lastModified = new Date('2026-06-02T10:00:00.000Z');
    const client = new FakeAwsClient([
      {
        Contents: [{ Key: 'prefix/a.txt', Size: 10, LastModified: lastModified }, { Size: 99 }],
        IsTruncated: true,
        NextContinuationToken: 'next-page',
      },
      { Contents: [{ Key: 'prefix/b.txt' }], IsTruncated: false },
    ]);

    assert.deepStrictEqual(await serviceOf(client).listObjects('bucket', 'prefix/', 2), [
      { key: 'prefix/a.txt', size: 10, lastModified },
      { key: 'prefix/b.txt', size: 0 },
    ]);
    const [first, second] = client.inputs(ListObjectsV2Command);
    assert.strictEqual(first?.['Prefix'], 'prefix/');
    assert.strictEqual(first?.['MaxKeys'], 2);
    assert.strictEqual(second?.['ContinuationToken'], 'next-page');
  });
});
