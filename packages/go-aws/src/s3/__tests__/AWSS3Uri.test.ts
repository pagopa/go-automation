import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSS3Uri } from '../AWSS3Uri.js';

describe('AWSS3Uri', () => {
  it('parses, formats and joins S3 URIs', () => {
    assert.deepStrictEqual(AWSS3Uri.parse('s3://my-bucket/reports/path/'), {
      bucket: 'my-bucket',
      key: 'reports/path/',
      uri: 's3://my-bucket/reports/path/',
    });
    assert.strictEqual(AWSS3Uri.format('my-bucket', 'reports/file.csv'), 's3://my-bucket/reports/file.csv');
    assert.strictEqual(AWSS3Uri.joinKey('/reports/path/', '/file.csv'), 'reports/path/file.csv');
  });

  it('rejects non-S3 and unsafe URIs', () => {
    assert.throws(() => AWSS3Uri.parse('https://example.com/file.csv'), /Invalid S3 URI/);
    assert.throws(() => AWSS3Uri.parse('s3://bad bucket/file.csv'), /Invalid S3 URI/);
    assert.throws(() => AWSS3Uri.parse('s3://bucket/file.csv?x=1'), /Invalid S3 URI/);
    assert.throws(() => AWSS3Uri.parse('s3://My-Bucket/file.csv'), /Invalid S3 URI/);
    assert.throws(() => AWSS3Uri.parse('s3://bucket:443/file.csv'), /Invalid S3 URI/);
  });
});
