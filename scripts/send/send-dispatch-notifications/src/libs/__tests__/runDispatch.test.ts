import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { Core } from '@go-automation/go-common';

import type { DispatchTarget } from '../../types/DispatchTarget.js';
import type { SendDispatchNotificationsConfig } from '../../types/SendDispatchNotificationsConfig.js';
import { DispatchShutdown } from '../DispatchShutdown.js';
import { runDispatch } from '../runDispatch.js';
import { validateConfig } from '../validateConfig.js';
import type { TestScript } from './helpers/testScript.js';
import { QA_HEADER, RAW_CONFIG, createTestScript, qaRow, readFixture, writeFixture } from './helpers/testScript.js';

const IUNS = ['PAYK-MWDR-ZUAZ-202601-K-1', 'TQJZ-VKMH-QDYX-202601-Q-1'];

const TARGET: DispatchTarget = {
  name: 'ente-test',
  b2b: { basePath: 'https://api.test.example', apiKey: 'secret', apiKeyLabel: '$K …cret' },
  production: false,
  groupId: 'group-1',
  sender: { taxId: '00000000001', denomination: 'Comune di Test' },
  defaults: new Map(),
};

/** Production environment read only through pn-Timelines (request-id phase). */
const PRODUCTION: DispatchTarget = {
  name: 'ente-prod',
  production: true,
  sender: { taxId: '00000000001', denomination: 'Comune di Test' },
  defaults: new Map(),
};

/** Test environment read only through pn-Timelines: no B2B call. */
const TIMELINES_ONLY: DispatchTarget = { ...PRODUCTION, name: 'ente-test', production: false };

/** Request-id only, real run, timers short enough for a test. */
const REQUEST_ID_RUN: Partial<SendDispatchNotificationsConfig> = {
  phases: ['request-id'],
  awsProfiles: ['sso_a'],
  dryRun: false,
  requestIdInitialDelay: '1ms',
  requestIdTimeout: '1ms',
};

interface Run {
  readonly code: number;
  readonly test: TestScript;
  readonly shutdown: DispatchShutdown;
  readonly report: string | undefined;
}

async function run(
  lines: ReadonlyArray<string>,
  overrides: Partial<SendDispatchNotificationsConfig> = {},
  target: DispatchTarget = TARGET,
  answer: boolean | undefined = true,
): Promise<Run> {
  const test = await createTestScript(answer);
  const input = path.join(test.dir, 'in', 'input.csv');
  const pdf = path.join(test.dir, 'in', 'atto.pdf');
  await writeFixture(input, `${[QA_HEADER, ...lines].join('\n')}\n`);
  await writeFixture(pdf, '%PDF-1.4 atto');
  const shutdown = new DispatchShutdown();
  const config = validateConfig({ ...RAW_CONFIG, inputFile: input, documentFile: [pdf], ...overrides });
  const code = await runDispatch(test.script, config, target, shutdown);
  const report = await readFixture(test.script.paths.getExecutionOutputFilePath('report.csv'));
  return { code, test, shutdown, report };
}

/** Resolves to `released` when the cleanup hook returns, `hung` after one second. */
async function cleanupHook(shutdown: DispatchShutdown): Promise<string> {
  return Promise.race([
    shutdown.stopAndWait().then(() => 'released'),
    new Promise<string>((resolve) => setTimeout(() => resolve('hung'), 1_000).unref()),
  ]);
}

describe('runDispatch exit codes (dry run)', () => {
  it('returns 0 and writes output and report for valid rows', async () => {
    const { code, test, report } = await run([qaRow('S-1'), qaRow('S-2')]);
    assert.equal(code, 0);
    assert.match(report ?? '', /DRY_RUN/);
    assert.ok(test.logger.of('info').some((line) => line.startsWith('Dry run: 2 righe da inviare. Piano e report')));
    assert.ok(test.logger.of('kv').includes('Righe=2 lette · 2 valide · 0 non valide → 2 da inviare · 2 da elaborare'));
  });

  it('returns 2 with invalid rows', async () => {
    const { code, report } = await run([qaRow('S-1'), qaRow('S-2', '12')]);
    assert.equal(code, 2);
    assert.match(report ?? '', /INVALID/);
  });

  it('returns 1 without a stack trace on duplicate row keys, after writing the report', async () => {
    const { code, test, report } = await run([qaRow('S-1'), qaRow('S-1')]);
    assert.equal(code, 1);
    assert.ok(report !== undefined, 'report materialized');
    assert.ok(test.logger.of('error').some((line) => line.startsWith('Chiavi di riga duplicate: nessun invio')));
  });

  it('returns 1 with --fail-fast and invalid rows, after writing the report', async () => {
    const { code, test, report } = await run([qaRow('S-1'), qaRow('S-2', '12')], { failFast: true });
    assert.equal(code, 1);
    assert.ok(report !== undefined);
    assert.ok(test.logger.of('error').some((line) => line.startsWith('--fail-fast')));
  });

  it('releases the cleanup hook once the run is over', async () => {
    const { shutdown } = await run([qaRow('S-1')]);
    assert.equal(await cleanupHook(shutdown), 'released');
    assert.equal(shutdown.wasInterrupted, false);
  });
});

describe('runDispatch confirmation', () => {
  const rows = [qaRow('S-1', '00100', IUNS[0]), qaRow('S-2', '00100', IUNS[1])];

  it('returns 1 in production without --confirm-production, without asking', async () => {
    const { code, test } = await run(rows, REQUEST_ID_RUN, PRODUCTION);
    assert.equal(code, 1);
    assert.deepEqual(test.prompt.questions, []);
    assert.ok(test.logger.of('error').some((line) => line.includes('--confirm-production=2')));
  });

  it('returns 3 when the user declines', async () => {
    const { code, test } = await run(rows, { ...REQUEST_ID_RUN, confirmProduction: 2 }, PRODUCTION, false);
    assert.equal(code, 3);
    assert.deepEqual(test.prompt.questions, ['Elaborare 2 righe (nessun invio) IN PRODUZIONE?']);
  });

  it('runs the confirmed phases and returns the exit code of the outcome', async () => {
    const { code, test, report } = await run(rows, { ...REQUEST_ID_RUN, confirmProduction: 2 }, PRODUCTION);
    assert.equal(code, 2, 'requestId not found within the timeout');
    assert.match(report ?? '', /REQUEST_ID_NOT_FOUND/);
    assert.ok(test.logger.of('kv').includes('Non inviate=0'));
  });

  it('stops before sending when a signal arrives during the confirmation', async () => {
    const test = await createTestScript(true);
    const input = path.join(test.dir, 'in', 'input.csv');
    await writeFixture(input, `${[QA_HEADER, ...rows].join('\n')}\n`);
    const shutdown = new DispatchShutdown();
    let hook: Promise<void> | undefined;
    test.prompt.onConfirm = (): void => {
      hook = shutdown.stopAndWait();
    };
    const config = validateConfig({ ...RAW_CONFIG, ...REQUEST_ID_RUN, inputFile: input });
    const code = await runDispatch(test.script, config, TIMELINES_ONLY, shutdown);
    await hook;
    assert.equal(code, 1);
    assert.equal(shutdown.wasInterrupted, true);
    assert.ok(test.logger.of('warning').some((line) => line.startsWith("Run interrotto prima dell'invio")));
    const report = await readFixture(test.script.paths.getExecutionOutputFilePath('report.csv'));
    assert.ok(report !== undefined, 'the rows validated so far are reported');
  });

  it('writes the report before a Ctrl-C on the confirmation reaches GOScript', async () => {
    const test = await createTestScript(true);
    const input = path.join(test.dir, 'in', 'input.csv');
    await writeFixture(input, `${[QA_HEADER, ...rows].join('\n')}\n`);
    test.prompt.onConfirm = (): void => {
      throw new Core.GOPromptInterruptedError();
    };
    const config = validateConfig({ ...RAW_CONFIG, ...REQUEST_ID_RUN, inputFile: input });

    await assert.rejects(
      runDispatch(test.script, config, TIMELINES_ONLY, new DispatchShutdown()),
      Core.GOPromptInterruptedError,
    );
    const report = await readFixture(test.script.paths.getExecutionOutputFilePath('report.csv'));
    assert.ok(report !== undefined);
  });

  it('releases the cleanup hook even when the materialization fails', async () => {
    const test = await createTestScript(true);
    const input = path.join(test.dir, 'in', 'input.csv');
    await writeFixture(input, `${[QA_HEADER, ...rows].join('\n')}\n`);
    const shutdown = new DispatchShutdown();
    const config = validateConfig({
      ...RAW_CONFIG,
      ...REQUEST_ID_RUN,
      inputFile: input,
      yes: true,
      outputFile: '/dev/null/not-a-dir/output.csv',
    });
    await assert.rejects(runDispatch(test.script, config, TIMELINES_ONLY, shutdown));
    assert.equal(await cleanupHook(shutdown), 'released');
  });

  it('returns 2 on a resume with nothing left to do but rows still without requestId', async () => {
    const first = await run(rows, REQUEST_ID_RUN, TIMELINES_ONLY);
    const previousDir = path.dirname(first.test.script.paths.getExecutionOutputFilePath('run.json'));
    // Both workflows ended without PREPARE_*: a resume has nothing left to query.
    const journalPath = path.join(previousDir, 'journal.jsonl');
    const ended = [0, 1].map((rowIndex) =>
      JSON.stringify({
        ts: '2026-11-05T10:00:00.000Z',
        event: 'REQUEST_ID_NOT_FOUND',
        rowIndex,
        rowKey: `S-${rowIndex + 1}`,
        requestIdReason: 'WORKFLOW_ENDED:COMPLETELY_UNREACHABLE',
      }),
    );
    await writeFixture(journalPath, `${(await readFixture(journalPath)) ?? ''}${ended.join('\n')}\n`);

    const test = await createTestScript(true);
    const config = validateConfig({ ...RAW_CONFIG, ...REQUEST_ID_RUN, inputFile: undefined, resume: previousDir });
    const code = await runDispatch(test.script, config, TIMELINES_ONLY, new DispatchShutdown());

    assert.ok(test.logger.of('info').includes('Nessuna riga da elaborare: nessun invio'));
    assert.equal(code, 2, 'rows left without requestId are still problems');
  });

  it('replays the previous journal in a dry run of the resume', async () => {
    const first = await run(rows, REQUEST_ID_RUN, TIMELINES_ONLY);
    const previousDir = path.dirname(first.test.script.paths.getExecutionOutputFilePath('run.json'));

    const test = await createTestScript(true);
    const config = validateConfig({
      ...RAW_CONFIG,
      ...REQUEST_ID_RUN,
      inputFile: undefined,
      resume: previousDir,
      dryRun: true,
    });
    const code = await runDispatch(test.script, config, TIMELINES_ONLY, new DispatchShutdown());
    assert.equal(code, 0);
    assert.ok(test.logger.of('info').some((line) => line.startsWith('Dry run della ripresa: ')));
    assert.ok(test.logger.of('kv').some((line) => line.startsWith('Run=') && line.includes('ripresa di')));
    const report = await readFixture(test.script.paths.getExecutionOutputFilePath('report.csv'));
    assert.match(report ?? '', /REQUEST_ID_NOT_FOUND/, 'statuses come from the previous journal');
  });
});
