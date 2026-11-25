/* eslint-disable security/detect-non-literal-fs-filename -- isolated temporary file fixtures */
import type { GOScript } from '@go-automation/go-script';
import type { ResultField } from '@pagopa/go-aws/cloudwatch-logs';
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
const CONFIG: InteropTokenHashVerificationConfig = {
  awsProfile: 'pdnd-interop-test',
  cwLogGroup: '/aws/eks/interop-eks-cluster-test/application',
  s3BucketNameNdjson: 'originals',
  s3BucketNameP7m: 'signed',
  startUtc: '2026-10-05T07:55:00Z',
  endUtc: '2026-10-05T08:01:00Z',
  m2m: false,
};

/** Recorded interactions of a {@link createScript} double. */
interface ScriptHarness {
  readonly script: GOScript;
  readonly queries: string[];
  readonly events: string[];
  readonly hashes: string[];
}

/** S3 objects served by a {@link createScript} double. */
interface Downloads {
  /** Execution output directory. */
  readonly directory: string;
  /** Content of the original NDJSON; missing object when absent. */
  readonly original?: string;
}

/**
 * GOScript double: the CloudWatch queries answer `messages` in order (none
 * after the last), S3 serves the signed P7M of TOKEN_CONTENT and the given
 * original, spinner and logger calls are recorded and text output must
 * follow the spinner cleanup.
 *
 * @param messages - `@message` returned by each CloudWatch query
 * @param downloads - S3 objects, `undefined` when no download is allowed
 * @returns The double and its records
 */
function createScript(messages: ReadonlyArray<string>, downloads?: Downloads): ScriptHarness {
  const queries: string[] = [];
  const events: string[] = [];
  const hashes: string[] = [];
  let activeSpinner: string | undefined;
  const script = {
    getConfiguration: async (): Promise<InteropTokenHashVerificationConfig> => Promise.resolve(CONFIG),
    paths: { createExecutionOutputDir: () => downloads?.directory },
    aws: {
      services: {
        cloudWatchLogs: {
          async query(_groups: ReadonlyArray<string>, query: string): Promise<ResultField[][]> {
            const message = messages[queries.length];
            queries.push(query);
            return Promise.resolve(message === undefined ? [] : [[{ field: '@message', value: message }]]);
          },
        },
        s3: {
          async downloadToFile(bucket: string, _key: string, destination: string): Promise<void> {
            assert.ok(downloads !== undefined, 'No S3 download is allowed without a CID and filename');
            if (bucket === 'signed') {
              // Content-only PKCS#7 fixture: this script extracts content without validating signatures.
              const envelope = forge.pkcs7.createSignedData();
              envelope.content = forge.util.createBuffer(Buffer.from(ZIP_BASE64, 'base64').toString('binary'));
              const der = forge.asn1.toDer(envelope.toAsn1()).getBytes();
              await writeFile(destination, Buffer.from(der, 'binary'));
            } else if (downloads.original !== undefined) {
              await writeFile(destination, downloads.original);
            }
          },
        },
      },
    },
    logger: {
      section() {},
      info() {},
      step() {},
      text(line: string) {
        assert.equal(activeSpinner, undefined, 'Hash output must follow spinner cleanup');
        hashes.push(line);
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
        events.push(`stop:${String(activeSpinner)}`);
        activeSpinner = undefined;
      },
    },
  } as unknown as GOScript;
  return { script, queries, events, hashes };
}

describe('hash verification prerequisite failures', () => {
  it('fails without a CID instead of reporting a successful unperformed verification', async () => {
    const { script, queries } = createScript([]);
    await assert.rejects(main(script), /No CID found.*not performed/u);
    assert.strictEqual(queries.length, 1);
  });

  it('fails without a filename after the CID lookup and never downloads S3 objects', async () => {
    const { script, queries } = createScript(['ERROR [CID=audit-cid] upload failed']);
    await assert.rejects(main(script), /No filename found.*not performed/u);
    assert.strictEqual(queries.length, 2);
  });
});

describe('main hash verification spinner cleanup', () => {
  for (const outcome of ['matching', 'mismatching', 'missing'] as const) {
    it(`stops the spinner before returning or rejecting with ${outcome} original content`, async (t) => {
      const directory = await mkdtemp(join(tmpdir(), 'audit-spinner-test-'));
      t.after(async () => rm(directory, { recursive: true, force: true }));
      const original = { matching: TOKEN_CONTENT, mismatching: '{"token":"different"}\n', missing: undefined }[outcome];
      const { script, events, hashes } = createScript(
        ['ERROR [CID=audit-cid] upload failed', 'Getting file token.ndjson.zip.p7m'],
        { directory, ...(original === undefined ? {} : { original }) },
      );

      if (outcome === 'matching') {
        await main(script);
        assert.equal(events.at(-1), 'success');
        assert.equal(hashes.length, 2);
        for (const line of hashes) assert.match(line, /: +[a-f0-9]{64}$/u);
      } else {
        await assert.rejects(
          main(script),
          outcome === 'mismatching' ? /Hash verification failed!.*contents differ/u : /ENOENT/u,
        );
        assert.equal(events.includes('success'), false);
      }
      assert.ok(events.includes('start:Calculating hashes...'), 'The test must reach hash verification');
      assert.equal(events.filter((event) => event === 'stop:Calculating hashes...').length, 1);
      const starts = events.filter((event) => event.startsWith('start:')).length;
      assert.equal(events.filter((event) => event.startsWith('stop:')).length, starts, 'no spinner left active');
    });
  }
});
