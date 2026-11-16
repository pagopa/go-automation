import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import { AWSS3Service } from '../AWSS3Service.js';

type S3Command = GetObjectCommand | ListBucketsCommand | ListObjectsV2Command | PutObjectCommand;

type S3Response =
  | {
      readonly Body?: { transformToByteArray(): Promise<Uint8Array> };
    }
  | {
      readonly Buckets?: ReadonlyArray<{ readonly Name?: string; readonly CreationDate?: Date }>;
    }
  | {
      readonly Contents?: ReadonlyArray<{
        readonly Key?: string;
        readonly Size?: number;
        readonly LastModified?: Date;
      }>;
      readonly IsTruncated?: boolean;
      readonly NextContinuationToken?: string;
    }
  | Record<string, never>;

interface FakeS3Client {
  readonly commands: S3Command[];
  send(command: S3Command): Promise<S3Response>;
}

function asS3Client(client: FakeS3Client): S3Client {
  return client as unknown as S3Client;
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'go-common-s3-service-'));
}

describe('AWSS3Service', () => {
  it('uploads files with inferred content type and buffers with default content type', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'payload.JSON');
    await fs.writeFile(filePath, '{"ok":true}', 'utf-8');

    const fakeClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };
    const service = new AWSS3Service(asS3Client(fakeClient));

    assert.strictEqual(await service.uploadFile(filePath, 'bucket', 'payload.json'), 'payload.json');
    assert.strictEqual(await service.uploadBuffer(Buffer.from('raw'), 'bucket', 'raw.bin'), 'raw.bin');

    const fileCommand = fakeClient.commands[0];
    const bufferCommand = fakeClient.commands[1];
    assert.ok(fileCommand instanceof PutObjectCommand);
    assert.ok(bufferCommand instanceof PutObjectCommand);
    assert.strictEqual(fileCommand.input.ContentType, 'application/json');
    assert.strictEqual(bufferCommand.input.ContentType, 'application/octet-stream');
  });

  it('uploads only direct files from a directory and returns an empty list when it cannot read the directory', async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, 'a.txt'), 'alpha', 'utf-8');
    await fs.writeFile(path.join(dir, 'b.csv'), 'beta', 'utf-8');
    await fs.mkdir(path.join(dir, 'nested'));
    await fs.writeFile(path.join(dir, 'nested', 'ignored.txt'), 'ignored', 'utf-8');

    const fakeClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };
    const service = new AWSS3Service(asS3Client(fakeClient));

    const keys = await service.uploadDirectory(dir, 'bucket', 'prefix');
    assert.deepStrictEqual(keys.sort(), ['prefix/a.txt', 'prefix/b.csv']);
    assert.strictEqual(fakeClient.commands.length, 2);

    assert.deepStrictEqual(await service.uploadDirectory(path.join(dir, 'missing'), 'bucket', 'prefix'), []);
  });

  it('downloads objects and rejects empty S3 response bodies', async () => {
    const fakeClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        if (command instanceof GetObjectCommand) {
          return {
            Body: {
              async transformToByteArray() {
                await Promise.resolve();
                return new Uint8Array(Buffer.from('payload'));
              },
            },
          };
        }
        return {};
      },
    };
    const service = new AWSS3Service(asS3Client(fakeClient));

    assert.deepStrictEqual(await service.downloadFile('bucket', 'key'), Buffer.from('payload'));

    const emptyBodyClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };
    const emptyBodyService = new AWSS3Service(asS3Client(emptyBodyClient));
    await assert.rejects(emptyBodyService.downloadFile('bucket', 'missing'), /Empty response body/);
  });

  it('downloads objects to local files', async () => {
    const dir = await makeTempDir();
    const outputPath = path.join(dir, 'download.bin');
    const fakeClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {
          Body: {
            async transformToByteArray() {
              await Promise.resolve();
              return new Uint8Array(Buffer.from('file body'));
            },
          },
        };
      },
    };
    const service = new AWSS3Service(asS3Client(fakeClient));

    assert.strictEqual(await service.downloadToFile('bucket', 'key', outputPath), outputPath);
    assert.strictEqual(await fs.readFile(outputPath, 'utf-8'), 'file body');
  });

  it('lists buckets while skipping unnamed entries and preserving creation dates', async () => {
    const creationDate = new Date('2026-06-01T10:00:00.000Z');
    const fakeClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {
          Buckets: [{ Name: 'bucket-a', CreationDate: creationDate }, {}, { Name: 'bucket-b' }],
        };
      },
    };
    const service = new AWSS3Service(asS3Client(fakeClient));

    assert.deepStrictEqual(await service.listBuckets(), [{ name: 'bucket-a', creationDate }, { name: 'bucket-b' }]);

    const noBucketsClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };
    assert.deepStrictEqual(await new AWSS3Service(asS3Client(noBucketsClient)).listBuckets(), []);
  });

  it('lists objects across pages while skipping unnamed entries', async () => {
    const lastModified = new Date('2026-06-02T10:00:00.000Z');
    let calls = 0;
    const fakeClient: FakeS3Client = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        calls += 1;
        if (calls === 1) {
          return {
            Contents: [{ Key: 'prefix/a.txt', Size: 10, LastModified: lastModified }, { Size: 99 }],
            IsTruncated: true,
            NextContinuationToken: 'next-page',
          };
        }
        return {
          Contents: [{ Key: 'prefix/b.txt' }],
          IsTruncated: false,
        };
      },
    };
    const service = new AWSS3Service(asS3Client(fakeClient));

    assert.deepStrictEqual(await service.listObjects('bucket', 'prefix/', 2), [
      { key: 'prefix/a.txt', size: 10, lastModified },
      { key: 'prefix/b.txt', size: 0 },
    ]);
    assert.strictEqual(fakeClient.commands.length, 2);

    const firstCommand = fakeClient.commands[0];
    const secondCommand = fakeClient.commands[1];
    assert.ok(firstCommand instanceof ListObjectsV2Command);
    assert.ok(secondCommand instanceof ListObjectsV2Command);
    assert.strictEqual(firstCommand.input.Prefix, 'prefix/');
    assert.strictEqual(firstCommand.input.MaxKeys, 2);
    assert.strictEqual(secondCommand.input.ContinuationToken, 'next-page');
  });
});
