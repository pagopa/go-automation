import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { AWSS3BucketEntry, AWSS3Service } from '@go-automation/go-common/aws';
import { SENDSafeStorageS3Service } from '../SENDSafeStorageS3Service.js';

interface RecordedDownload {
  readonly bucket: string;
  readonly key: string;
}

interface FakeS3Service {
  readonly s3: AWSS3Service;
  readonly downloads: RecordedDownload[];
  readonly calls: { listBuckets: number };
}

function createFakeS3Service(bucketNames: ReadonlyArray<string>, content = Buffer.from('file-content')): FakeS3Service {
  const downloads: RecordedDownload[] = [];
  const calls = { listBuckets: 0 };

  const listBuckets = mock.fn(async (): Promise<ReadonlyArray<AWSS3BucketEntry>> => {
    await Promise.resolve();
    calls.listBuckets += 1;
    return bucketNames.map((name) => ({ name }));
  });

  const downloadFile = mock.fn(async (bucket: string, key: string): Promise<Buffer> => {
    await Promise.resolve();
    downloads.push({ bucket, key });
    return content;
  });

  return {
    s3: { listBuckets, downloadFile } as unknown as AWSS3Service,
    downloads,
    calls,
  };
}

describe('SENDSafeStorageS3Service', () => {
  describe('isSafeStorageUri', () => {
    it('recognizes safestorage:// URIs', () => {
      assert.equal(SENDSafeStorageS3Service.isSafeStorageUri('safestorage://PN_LEGAL_FACTS-abc.pdf'), true);
      assert.equal(SENDSafeStorageS3Service.isSafeStorageUri('s3://bucket/key'), false);
      assert.equal(SENDSafeStorageS3Service.isSafeStorageUri('PN_LEGAL_FACTS-abc.pdf'), false);
    });
  });

  describe('extractKey', () => {
    it('strips the safestorage:// prefix', () => {
      assert.equal(
        SENDSafeStorageS3Service.extractKey('safestorage://PN_LEGAL_FACTS-abc.pdf'),
        'PN_LEGAL_FACTS-abc.pdf',
      );
    });

    it('returns the value unchanged when it has no prefix', () => {
      assert.equal(SENDSafeStorageS3Service.extractKey('PN_LEGAL_FACTS-abc.pdf'), 'PN_LEGAL_FACTS-abc.pdf');
    });
  });

  describe('findBucket', () => {
    it('selects the safestorage bucket excluding staging and caches it', async () => {
      const fake = createFakeS3Service([
        'pn-other-bucket',
        'pn-safestorage-staging-eu-south-1',
        'pn-safestorage-eu-south-1-123456789012',
      ]);
      const service = new SENDSafeStorageS3Service(fake.s3);

      assert.equal(await service.findBucket(), 'pn-safestorage-eu-south-1-123456789012');
      assert.equal(await service.findBucket(), 'pn-safestorage-eu-south-1-123456789012');
      assert.equal(fake.calls.listBuckets, 1);
    });

    it('throws when no safestorage bucket is available', async () => {
      const fake = createFakeS3Service(['pn-other-bucket', 'pn-safestorage-staging-eu-south-1']);
      const service = new SENDSafeStorageS3Service(fake.s3);

      await assert.rejects(service.findBucket(), /Safe Storage bucket not found/);
    });
  });

  describe('downloadFile', () => {
    it('downloads the key from the resolved bucket', async () => {
      const fake = createFakeS3Service(['pn-safestorage-eu-south-1'], Buffer.from('pdf-bytes'));
      const service = new SENDSafeStorageS3Service(fake.s3);

      const buffer = await service.downloadFile('PN_LEGAL_FACTS-abc.pdf');

      assert.equal(buffer.toString(), 'pdf-bytes');
      assert.deepEqual(fake.downloads, [{ bucket: 'pn-safestorage-eu-south-1', key: 'PN_LEGAL_FACTS-abc.pdf' }]);
    });
  });

  describe('downloadToFile', () => {
    it('writes the file creating missing parent directories', async () => {
      const fake = createFakeS3Service(['pn-safestorage-eu-south-1'], Buffer.from('pdf-bytes'));
      const service = new SENDSafeStorageS3Service(fake.s3);
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'send-safestorage-'));

      try {
        const outputPath = path.join(tmpDir, 'nested', 'PN_LEGAL_FACTS-abc.pdf');
        const result = await service.downloadToFile('PN_LEGAL_FACTS-abc.pdf', outputPath);

        assert.equal(result, outputPath);
        assert.equal(await fs.readFile(outputPath, 'utf-8'), 'pdf-bytes');
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
