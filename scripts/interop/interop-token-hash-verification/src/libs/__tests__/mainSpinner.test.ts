/* eslint-disable security/detect-non-literal-fs-filename -- isolated temporary file fixtures */
import type { AWS, Core } from '@go-automation/go-common';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type * as forgeModule from 'node-forge';

import { main } from '../../main.js';
import type { InteropTokenHashVerificationConfig } from '../../types/index.js';

const forge = createRequire(import.meta.url)('node-forge') as typeof forgeModule;
const TOKEN_CONTENT = '{"token":"same"}\n';
// ZIP_STORED archive containing token.ndjson with TOKEN_CONTENT.
const ZIP_BASE64 =
  'UEsDBBQAAAAAAAAAIVwkEFX8EQAAABEAAAAMAAAAdG9rZW4ubmRqc29ueyJ0b2tlbiI6InNhbWUifQpQSwECFAMUAAAAAAAAACFcJBBV/BEAAAARAAAADAAAAAAAAAAAAAAAgAEAAAAAdG9rZW4ubmRqc29uUEsFBgAAAAABAAEAOgAAADsAAAAAAA==';

describe('main hash verification spinner cleanup', () => {
  for (const outcome of ['matching', 'mismatching', 'missing'] as const) {
    it(`stops the spinner before returning or rejecting with ${outcome} original content`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'audit-spinner-test-'));
      const events: string[] = [];
      let activeSpinner: string | undefined;
      let queryCount = 0;
      const config: InteropTokenHashVerificationConfig = {
        awsProfile: 'pdnd-interop-test',
        cwLogGroup: '/aws/eks/interop-eks-cluster-test/application',
        s3BucketNameNdjson: 'originals',
        s3BucketNameP7m: 'signed',
        startUtc: '2026-10-05T07:55:00Z',
        endUtc: '2026-10-05T08:01:00Z',
        m2m: false,
      };
      const script = {
        async getConfiguration(): Promise<InteropTokenHashVerificationConfig> {
          await Promise.resolve();
          return config;
        },
        paths: { createExecutionOutputDir: () => directory },
        aws: {
          services: {
            cloudWatchLogs: {
              async query(): Promise<ReadonlyArray<ReadonlyArray<AWS.ResultField>>> {
                await Promise.resolve();
                return [
                  [
                    {
                      field: '@message',
                      value:
                        ++queryCount === 1
                          ? 'ERROR [CID=audit-cid] upload failed'
                          : 'Getting file token.ndjson.zip.p7m',
                    },
                  ],
                ];
              },
            },
            s3: {
              async downloadToFile(bucket: string, _key: string, destination: string): Promise<void> {
                if (bucket === 'signed') {
                  // Content-only PKCS#7 fixture: this script extracts content without validating signatures.
                  const envelope = forge.pkcs7.createSignedData();
                  envelope.content = forge.util.createBuffer(Buffer.from(ZIP_BASE64, 'base64').toString('binary'));
                  const der = forge.asn1.toDer(envelope.toAsn1()).getBytes();
                  await writeFile(destination, Buffer.from(der, 'binary'));
                } else if (outcome !== 'missing') {
                  await writeFile(destination, outcome === 'matching' ? TOKEN_CONTENT : '{"token":"different"}\n');
                }
              },
            },
          },
        },
        logger: {
          section() {},
          info() {},
          step() {},
          text() {
            assert.equal(activeSpinner, undefined, 'Hash output must follow spinner cleanup');
          },
          success() {
            assert.equal(activeSpinner, undefined);
            events.push('success');
          },
        },
        prompt: {
          startSpinner(message: string) {
            activeSpinner = message;
            events.push(`start:${message}`);
          },
          stopSpinner() {
            events.push(`stop:${activeSpinner}`);
            activeSpinner = undefined;
          },
        },
      } as unknown as Core.GOScript;
      try {
        if (outcome === 'matching') {
          await main(script);
          assert.equal(events.at(-1), 'success');
        } else {
          await assert.rejects(
            main(script),
            outcome === 'mismatching' ? /Hash verification failed!.*contents differ/u : /ENOENT/u,
          );
          assert.equal(events.includes('success'), false);
        }
        assert.ok(events.includes('start:Calculating hashes...'), 'The test must reach hash verification');
        assert.equal(events.filter((event) => event === 'stop:Calculating hashes...').length, 1);
        assert.equal(activeSpinner, undefined);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
