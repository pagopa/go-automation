import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { CoverageReport } from '@go-automation/go-watchtower-runbook';

import type { Connection } from '../resolveClient.js';
import { COVERAGE_EXIT_CODES } from '../runCoverageCheck.js';
import type { CoverageCheckResult, CoverageExitCode } from '../runCoverageCheck.js';
import { runCoverageMode } from '../runCoverageMode.js';

const CONNECTION: Connection = {
  baseUrl: 'https://watchtower.example',
  client: {} as WatchtowerClient,
};

const REPORT: CoverageReport = {
  checkedRunbooks: 1,
  checkedKnownCases: 1,
  checkedReferences: 1,
  errors: [],
  warnings: [],
};

describe('runCoverageMode', () => {
  it('writes the report and preserves exit 0 and 1 returned by an executed check', async () => {
    const written: CoverageExitCode[] = [];
    for (const expected of [COVERAGE_EXIT_CODES.OK, COVERAGE_EXIT_CODES.INVALID_COVERAGE] as const) {
      const exitCode = await runCoverageMode(
        script(),
        { mode: 'coverage' },
        {
          resolveConnection,
          runCheck: async () => await Promise.resolve(reportResult(expected)),
          writeReport: async (_script, report, code) => {
            await Promise.resolve();
            assert.strictEqual(report, REPORT);
            written.push(code);
            return '/tmp/coverage.json';
          },
        },
      );

      assert.strictEqual(exitCode, expected);
    }
    assert.deepStrictEqual(written, [COVERAGE_EXIT_CODES.OK, COVERAGE_EXIT_CODES.INVALID_COVERAGE]);
  });

  it('returns 2 when credentials or connection data are missing', async () => {
    const exitCode = await runCoverageMode(
      script(),
      { mode: 'coverage' },
      {
        resolveConnection: async () => await Promise.resolve(undefined),
        runCheck: async () => await Promise.resolve(reportResult(COVERAGE_EXIT_CODES.OK)),
        writeReport,
      },
    );

    assert.strictEqual(exitCode, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
  });

  it('returns 2 when login or network access fails', async () => {
    const exitCode = await runCoverageMode(
      script(),
      { mode: 'coverage' },
      {
        resolveConnection: async () => await Promise.reject(new Error('login failed')),
        runCheck: async () => await Promise.resolve(reportResult(COVERAGE_EXIT_CODES.OK)),
        writeReport,
      },
    );

    assert.strictEqual(exitCode, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
  });

  it('returns 2 when the check fails unexpectedly', async () => {
    const exitCode = await runCoverageMode(
      script(),
      { mode: 'coverage' },
      {
        resolveConnection,
        runCheck: async () => await Promise.reject(new Error('parse failed')),
        writeReport,
      },
    );

    assert.strictEqual(exitCode, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
  });

  it('does not write an artifact when no report could be built', async () => {
    let writerCalled = false;
    const exitCode = await runCoverageMode(
      script(),
      { mode: 'coverage' },
      {
        resolveConnection,
        runCheck: async () =>
          await Promise.resolve({
            kind: 'NOT_EXECUTABLE',
            exitCode: COVERAGE_EXIT_CODES.NOT_EXECUTABLE,
          } as const),
        writeReport: async () => {
          await Promise.resolve();
          writerCalled = true;
          return '/tmp/coverage.json';
        },
      },
    );

    assert.strictEqual(exitCode, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
    assert.strictEqual(writerCalled, false);
  });

  it('returns 2 when the mandatory artifact cannot be written', async () => {
    const exitCode = await runCoverageMode(
      script(),
      { mode: 'coverage' },
      {
        resolveConnection,
        runCheck: async () => await Promise.resolve(reportResult(COVERAGE_EXIT_CODES.OK)),
        writeReport: async () => await Promise.reject(new Error('disk full')),
      },
    );

    assert.strictEqual(exitCode, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
  });
});

function script(): Core.GOScript {
  return { logger: new Core.GOLogger([]) } as Core.GOScript;
}

async function resolveConnection(): Promise<Connection> {
  await Promise.resolve();
  return CONNECTION;
}

async function writeReport(): Promise<string> {
  await Promise.resolve();
  return '/tmp/coverage.json';
}

function reportResult(exitCode: CoverageExitCode): CoverageCheckResult {
  return { kind: 'REPORT', report: REPORT, exitCode };
}
