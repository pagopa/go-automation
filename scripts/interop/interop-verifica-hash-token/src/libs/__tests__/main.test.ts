import type { AWS, Core } from '@go-automation/go-common';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { main } from '../../main.js';
import type { InteropVerificaHashTokenConfig } from '../../types/index.js';

interface ScriptHarness {
  readonly script: Core.GOScript;
  readonly queries: string[];
}

function createScript(applicationLog: string | undefined): ScriptHarness {
  const queries: string[] = [];
  const config: InteropVerificaHashTokenConfig = {
    awsProfile: 'pdnd-interop-prod',
    cwLogGroup: '/aws/eks/interop-eks-cluster-prod/application',
    s3BucketNameNdjson: 'originals',
    s3BucketNameP7m: 'signed',
    startUtc: '2026-10-05T07:55:00Z',
    endUtc: '2026-10-05T08:01:00Z',
  };
  const script = {
    async getConfiguration(): Promise<InteropVerificaHashTokenConfig> {
      await Promise.resolve();
      return config;
    },
    aws: {
      services: {
        cloudWatchLogs: {
          async query(
            _groups: ReadonlyArray<string>,
            query: string,
          ): Promise<ReadonlyArray<ReadonlyArray<AWS.ResultField>>> {
            await Promise.resolve();
            queries.push(query);
            return queries.length === 1 && applicationLog !== undefined
              ? [[{ field: '@message', value: applicationLog }]]
              : [];
          },
        },
        s3: {
          downloadToFile(): never {
            assert.fail('No S3 download is allowed without a CID and filename');
          },
        },
      },
    },
    logger: { section() {}, info() {} },
    prompt: { startSpinner() {}, stopSpinner() {} },
  } as unknown as Core.GOScript;
  return { script, queries };
}

describe('hash verification prerequisite failures', () => {
  it('fails without a CID instead of reporting a successful unperformed verification', async () => {
    const { script, queries } = createScript(undefined);
    await assert.rejects(main(script), /No CID found.*not performed/u);
    assert.strictEqual(queries.length, 1);
  });

  it('fails without a filename after the CID lookup and never downloads S3 objects', async () => {
    const { script, queries } = createScript('ERROR [CID=audit-cid] upload failed');
    await assert.rejects(main(script), /No filename found.*not performed/u);
    assert.strictEqual(queries.length, 2);
  });
});
