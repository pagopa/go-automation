import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import { scriptMetadata } from '../../config.js';
import type { DispatchTarget } from '../../types/DispatchTarget.js';
import type { PreparedSession } from '../../types/PreparedSession.js';
import type { SendDispatchNotificationsConfig } from '../../types/SendDispatchNotificationsConfig.js';
import {
  createSessionOptions,
  effectiveRate,
  resolveInputFormat,
  resolveOutputFormat,
  timelinesProfile,
} from '../createSessionOptions.js';
import { DispatchUsageError } from '../DispatchUsageError.js';
import { validateConfig } from '../validateConfig.js';
import { QA_HEADER, RAW_CONFIG, createTestScript, qaRow, writeFixture } from './helpers/testScript.js';

const TARGET: DispatchTarget = {
  name: 'ente-test',
  b2b: { basePath: 'https://api.test.example', apiKey: 'secret', apiKeyLabel: '$K …cret' },
  production: false,
  sender: { taxId: '00000000001', denomination: 'Comune di Test' },
  defaults: new Map(),
};

const QA_TEST = Dispatch.BUILT_IN_PROFILES.get('qa-test');

/** Writes a qa-test CSV and a PDF in `dir`. */
async function inputFixture(dir: string): Promise<{ input: string; pdf: string }> {
  const input = path.join(dir, 'in', 'input.csv');
  const pdf = path.join(dir, 'in', 'atto.pdf');
  await writeFixture(input, `${[QA_HEADER, qaRow('S-1'), qaRow('S-2')].join('\n')}\n`);
  await writeFixture(pdf, '%PDF-1.4 atto');
  return { input, pdf };
}

/** Writes the run.json of a "previous" session with the given parameters; returns its directory. */
async function previousRun(dir: string, input: string, parameters: Readonly<Record<string, unknown>>): Promise<string> {
  const runDir = path.join(dir, 'previous-run');
  const info: Dispatch.RunInfo = {
    runId: '20261103-100000-prev',
    createdAt: '2026-11-03T10:00:00.000Z',
    inputPath: input,
    inputSha256: 'not-checked-here',
    journalFiles: [],
    parameters,
  };
  await new Core.GOJSONFileExporter({ outputPath: path.join(runDir, 'run.json'), pretty: true }).export(info);
  return runDir;
}

async function prepare(
  raw: SendDispatchNotificationsConfig,
  target: DispatchTarget = TARGET,
): Promise<PreparedSession> {
  const { script } = await createTestScript();
  return createSessionOptions(script, validateConfig(raw), target);
}

describe('effectiveRate and timelinesProfile', () => {
  it('defaults the rate to 20/s in e2e and 5/s in direct', () => {
    assert.equal(effectiveRate({ mode: 'e2e' }), 20);
    assert.equal(effectiveRate({ mode: 'direct' }), 5);
    assert.equal(effectiveRate({ mode: 'direct', rate: 2 }), 2);
  });

  it('requires --aws-profiles, uses the only profile or the one of the environment', () => {
    assert.throws(() => timelinesProfile({}, TARGET), DispatchUsageError);
    assert.equal(timelinesProfile({ awsProfiles: ['sso_a'] }, TARGET), 'sso_a');
    assert.equal(timelinesProfile({ awsProfiles: ['sso_a', 'sso_b'] }, { ...TARGET, awsProfile: 'sso_b' }), 'sso_b');
    assert.throws(
      () => timelinesProfile({ awsProfiles: ['sso_a'] }, { ...TARGET, awsProfile: 'sso_b' }),
      /add it to --aws-profiles/,
    );
    assert.throws(() => timelinesProfile({ awsProfiles: ['sso_a', 'sso_b'] }, TARGET), /several profiles/);
  });
});

describe('formats', () => {
  it('resolves the input format from option, extension, then profile', () => {
    assert.ok(QA_TEST !== undefined);
    assert.equal(resolveInputFormat('json', '/x/in.csv', QA_TEST), 'json');
    assert.equal(resolveInputFormat(undefined, '/x/in.jsonl', QA_TEST), 'jsonl');
    assert.equal(resolveInputFormat(undefined, '/x/in.txt', QA_TEST), 'csv');
    const noFormat: Dispatch.MappingProfile = { name: 'x', columns: {} };
    assert.throws(() => resolveInputFormat(undefined, '/x/in.txt', noFormat), /--input-format/);
  });

  it('writes the output in the input format unless --output-format is given', () => {
    assert.equal(resolveOutputFormat(undefined, 'json'), 'json');
    assert.equal(resolveOutputFormat('csv', 'json'), 'csv');
  });

  it('uses the input format for a JSON input with a CSV profile', async () => {
    const { dir } = await createTestScript();
    const input = path.join(dir, 'in', 'input.json');
    await writeFixture(input, '[]');
    const { options } = await prepare({ ...RAW_CONFIG, inputFile: input });
    assert.equal(options.input.format, 'json');
    assert.equal(options.output.format, 'json');
    assert.match(options.output.outputPath, /output\.json$/);
    assert.match(options.output.reportPath, /report\.json$/);
  });

  it('honours --output-format', async () => {
    const { dir } = await createTestScript();
    const { input } = await inputFixture(dir);
    const { options } = await prepare({ ...RAW_CONFIG, inputFile: input, outputFormat: 'jsonl' });
    assert.equal(options.input.format, 'csv');
    assert.equal(options.output.format, 'jsonl');
    assert.equal(options.output.delimiter, undefined);
  });
});

describe('createSessionOptions', () => {
  it('passes the parsed durations and records the script version and the identity in run.json', async () => {
    const { dir } = await createTestScript();
    const { input } = await inputFixture(dir);
    const { options, timelinesProfile: profile } = await prepare({
      ...RAW_CONFIG,
      inputFile: input,
      sendTimeout: '2m',
      verifyInitialDelay: '1500ms',
      phases: ['send', 'verify', 'request-id'],
      awsProfiles: ['sso_a'],
      requestIdTimeout: '1.5h',
    });
    assert.equal(options.tuning.sendTimeoutMs, 120_000);
    assert.equal(options.tuning.verifyInitialDelayMs, 1_500);
    assert.equal(options.requestId?.timeoutMs, 5_400_000);
    assert.equal(profile, 'sso_a');
    assert.equal(options.parameters['scriptVersion'], scriptMetadata.version);
    const identity = options.parameters['identity'] as Readonly<Record<string, string>>;
    assert.equal(identity['mode'], 'e2e');
    assert.equal(identity['mappingProfile'], 'qa-test');
    assert.equal(identity['env'], 'ente-test');
    assert.equal(identity['endpoint'], 'https://api.test.example');
    assert.match(identity['environmentValues'] ?? '', /sender\.taxId=00000000001/);
  });

  it('does not use documents without the send phase, nor a B2B API without a B2B target', async () => {
    const { dir } = await createTestScript();
    const { input, pdf } = await inputFixture(dir);
    const { name, production, defaults } = TARGET;
    const { options } = await prepare(
      { ...RAW_CONFIG, inputFile: input, phases: ['request-id'], awsProfiles: ['sso_a'], documentFile: [pdf] },
      { name, production, defaults },
    );
    assert.equal(options.sharedDocument, undefined);
    assert.equal(options.api, undefined);
    assert.equal(options.send, false);
    assert.ok(options.requestId !== undefined);
  });

  it('hashes a custom mapping profile file', async () => {
    const { dir } = await createTestScript();
    const { input } = await inputFixture(dir);
    const profileFile = path.join(dir, 'profile.json');
    await writeFixture(profileFile, JSON.stringify({ name: 'custom', columns: { Scenario: 'subject' } }));
    const { options } = await prepare({ ...RAW_CONFIG, inputFile: input, mappingProfile: profileFile });
    const identity = options.parameters['identity'] as Readonly<Record<string, string>>;
    assert.equal(identity['mappingProfile'], 'custom');
    assert.match(identity['mappingProfileSha256'] ?? '', /^[0-9a-f]{64}$/);
  });
});

describe('createSessionOptions on resume', () => {
  it('resumes with the same settings, reusing run id and input', async () => {
    const { dir } = await createTestScript();
    const { input } = await inputFixture(dir);
    const first = await prepare({ ...RAW_CONFIG, inputFile: input });
    const resumeDir = await previousRun(dir, input, first.options.parameters);

    const { run } = await prepare({
      ...RAW_CONFIG,
      inputFile: undefined,
      resume: resumeDir,
      phases: ['send'],
      rate: 5,
      verifyTimeout: '1h',
    });
    assert.equal(run.runId, '20261103-100000-prev');
    assert.equal(run.inputFile, input);
  });

  it('refuses a resume with different settings, listing them', async () => {
    const { dir } = await createTestScript();
    const { input } = await inputFixture(dir);
    const first = await prepare({ ...RAW_CONFIG, inputFile: input });
    const resumeDir = await previousRun(dir, input, first.options.parameters);

    await assert.rejects(
      prepare(
        {
          ...RAW_CONFIG,
          inputFile: undefined,
          resume: resumeDir,
          mappingProfile: 'standard',
          rowKeyColumn: 'Scenario',
        },
        { ...TARGET, name: 'ente-uat' },
      ),
      (error: unknown) => {
        assert.ok(error instanceof DispatchUsageError);
        assert.match(error.message, /mappingProfile: "qa-test" → "standard"/);
        assert.match(error.message, /rowKeyColumn: "" → "Scenario"/);
        assert.match(error.message, /env: "ente-test" → "ente-uat"/);
        return true;
      },
    );
  });

  it('compares environment and defaults only for the phases that use them', async () => {
    const { dir } = await createTestScript();
    const { input } = await inputFixture(dir);
    const first = await prepare({ ...RAW_CONFIG, inputFile: input });
    const resumeDir = await previousRun(dir, input, first.options.parameters);
    const { name, production, defaults } = TARGET;

    // request-id only: no B2B target and no defaults needed, the row identity is unchanged.
    await prepare(
      { ...RAW_CONFIG, inputFile: undefined, resume: resumeDir, phases: ['request-id'], awsProfiles: ['sso_a'] },
      { name: 'ad-hoc', production, defaults },
    );
    // verify only: the B2B target must match, the defaults may differ.
    await prepare(
      { ...RAW_CONFIG, inputFile: undefined, resume: resumeDir, phases: ['verify'], defaults: ['subject=X'] },
      { ...TARGET, name },
    );
    await assert.rejects(
      prepare({ ...RAW_CONFIG, inputFile: undefined, resume: resumeDir, defaults: ['subject=X'] }),
      /cliValues: "" → "subject=X"/,
    );
  });

  it('refuses to resume a run.json without the saved identity', async () => {
    const { dir } = await createTestScript();
    const { input } = await inputFixture(dir);
    const resumeDir = await previousRun(dir, input, { env: 'ente-test', mode: 'e2e' });
    await assert.rejects(
      prepare({ ...RAW_CONFIG, inputFile: undefined, resume: resumeDir }),
      /does not record the settings/,
    );
  });

  it('explains that a dry run has nothing to resume', async () => {
    const { dir } = await createTestScript();
    await assert.rejects(
      prepare({ ...RAW_CONFIG, inputFile: undefined, resume: path.join(dir, 'missing-run') }),
      (error: unknown) => error instanceof DispatchUsageError && /dry run has nothing to resume/.test(error.message),
    );
  });
});
