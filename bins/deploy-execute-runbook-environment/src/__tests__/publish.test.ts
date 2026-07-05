import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NoSuchKey } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

import { buildCatalog, serializeCatalog } from '../catalog.js';
import { publishCatalog, readCurrentCatalog } from '../publish.js';

const CATALOG = buildCatalog({
  environment: 'test',
  artifactRevision: 'a',
  actorArn: 'test',
  changeNote: 'publish',
  publishedAt: '2026-07-01T00:00:00.000Z',
  runbooks: [
    {
      key: 'send-apigw-analysis',
      version: '1.0.0',
      name: 'SEND API Gateway analysis',
      description: 'Analyzes a SEND API Gateway alarm',
      team: 'GO',
      kind: 'APIGW',
      categories: ['DELIVERY'],
      tags: ['send'],
      alarmNames: ['send-api-errors'],
      definitionDigest: `sha256-${'a'.repeat(64)}`,
    },
  ],
});

interface SentCommand {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

function fakeS3Client(handler: (name: string, input: Readonly<Record<string, unknown>>) => unknown): {
  readonly client: S3Client;
  readonly sent: SentCommand[];
} {
  const sent: SentCommand[] = [];
  const client = {
    send: (command: { readonly input: Readonly<Record<string, unknown>> }) => {
      const name = command.constructor.name;
      sent.push({ name, input: command.input });
      return Promise.resolve(handler(name, command.input));
    },
  } as unknown as S3Client; // Safe: publish.ts only calls client.send
  return { client, sent };
}

describe('catalog publication', () => {
  it('returns undefined when no catalog object exists yet', async () => {
    const { client } = fakeS3Client(() => {
      throw new NoSuchKey({ $metadata: { httpStatusCode: 404 }, message: 'missing' });
    });
    assert.equal(await readCurrentCatalog(client, 'bucket', 'key'), undefined);
  });

  it('reads and validates the current catalog with its ETag and version', async () => {
    const body = serializeCatalog(CATALOG);
    const { client } = fakeS3Client((name) => {
      if (name === 'HeadObjectCommand') return { ETag: '"etag-1"', VersionId: 'v1' };
      if (name === 'GetObjectCommand') return { Body: { transformToString: () => Promise.resolve(body) } };
      throw new Error(`Unexpected command ${name}`);
    });
    const current = await readCurrentCatalog(client, 'bucket', 'key');
    assert.deepEqual(current?.catalog, CATALOG);
    assert.equal(current?.etag, '"etag-1"');
    assert.equal(current?.versionId, 'v1');
  });

  it('publishes with create-only and compare-and-swap preconditions', async () => {
    let storedBody = '';
    const { client, sent } = fakeS3Client((name, input) => {
      if (name === 'PutObjectCommand') {
        storedBody = input['Body'] as string; // Safe: publishCatalog always sends a string body
        return { ETag: '"etag-2"', VersionId: 'v2' };
      }
      if (name === 'GetObjectCommand') return { Body: { transformToString: () => Promise.resolve(storedBody) } };
      throw new Error(`Unexpected command ${name}`);
    });
    const first = await publishCatalog(client, 'bucket', 'key', CATALOG, undefined);
    assert.equal(first.etag, '"etag-2"');
    assert.equal(first.versionId, 'v2');
    await publishCatalog(client, 'bucket', 'key', CATALOG, '"etag-2"');
    const puts = sent.filter((command) => command.name === 'PutObjectCommand');
    assert.equal(puts[0]?.input['IfNoneMatch'], '*');
    assert.equal(puts[0]?.input['IfMatch'], undefined);
    assert.equal(puts[1]?.input['IfMatch'], '"etag-2"');
    assert.equal(puts[1]?.input['IfNoneMatch'], undefined);
  });

  it('rejects a publish whose read-back bytes differ', async () => {
    const { client } = fakeS3Client((name) => {
      if (name === 'PutObjectCommand') return { ETag: '"etag-3"' };
      if (name === 'GetObjectCommand') return { Body: { transformToString: () => Promise.resolve('{}') } };
      throw new Error(`Unexpected command ${name}`);
    });
    await assert.rejects(publishCatalog(client, 'bucket', 'key', CATALOG, undefined), /bytes do not match/u);
  });
});
