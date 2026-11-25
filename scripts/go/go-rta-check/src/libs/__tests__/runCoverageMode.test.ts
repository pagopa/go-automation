import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOScript } from '@go-automation/go-script';
import { GOLogger } from '@pagopa/go-common/logging';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { CoverageReport } from '@go-automation/go-watchtower-runbook';

import type { Connection } from '../resolveClient.js';
import { COVERAGE_EXIT_CODES } from '../runCoverageCheck.js';
import type { CoverageCheckResult, CoverageExitCode, runCoverageCheck } from '../runCoverageCheck.js';
import { runCoverageMode } from '../runCoverageMode.js';
import type { writeCoverageReport } from '../../report/writeCoverageReport.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

/** Resolves the Watchtower connection of the coverage mode. */
type ResolveConnectionFn = (script: GOScript, config: GoRtaCheckConfig) => Promise<Connection | undefined>;

/** Collaborators of the coverage mode (mirrors the module's own, which is not exported). */
interface CoverageModeDependencies {
  readonly resolveConnection: ResolveConnectionFn;
  readonly runCheck: typeof runCoverageCheck;
  readonly writeReport: typeof writeCoverageReport;
}

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
      const exitCode = await run({
        runCheck: async () => await Promise.resolve(reportResult(expected)),
        writeReport: async (_script, report, code) => {
          await Promise.resolve();
          assert.strictEqual(report, REPORT);
          written.push(code);
          return '/tmp/coverage.json';
        },
      });

      assert.strictEqual(exitCode, expected);
    }
    assert.deepStrictEqual(written, [COVERAGE_EXIT_CODES.OK, COVERAGE_EXIT_CODES.INVALID_COVERAGE]);
  });

  const notExecutableCases: ReadonlyArray<readonly [string, Partial<CoverageModeDependencies>]> = [
    ['credentials or connection data are missing', { resolveConnection: async () => await Promise.resolve(undefined) }],
    [
      'login or network access fails',
      { resolveConnection: async () => await Promise.reject(new Error('login failed')) },
    ],
    ['the check fails unexpectedly', { runCheck: async () => await Promise.reject(new Error('parse failed')) }],
    [
      'the mandatory artifact cannot be written',
      { writeReport: async () => await Promise.reject(new Error('disk full')) },
    ],
  ];

  for (const [when, overrides] of notExecutableCases) {
    it(`returns 2 when ${when}`, async () => {
      assert.strictEqual(await run(overrides), COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
    });
  }

  it('does not write an artifact when no report could be built', async () => {
    let writerCalled = false;
    const exitCode = await run({
      runCheck: async () =>
        await Promise.resolve({ kind: 'NOT_EXECUTABLE', exitCode: COVERAGE_EXIT_CODES.NOT_EXECUTABLE } as const),
      writeReport: async () => {
        await Promise.resolve();
        writerCalled = true;
        return '/tmp/coverage.json';
      },
    });

    assert.strictEqual(exitCode, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
    assert.strictEqual(writerCalled, false);
  });
});

/** Runs the coverage mode with a working connection, check and writer, unless overridden. */
async function run(overrides: Partial<CoverageModeDependencies>): Promise<CoverageExitCode> {
  return await runCoverageMode(
    { logger: new GOLogger([]) } as GOScript,
    { mode: 'coverage' },
    {
      resolveConnection: async () => await Promise.resolve(CONNECTION),
      runCheck: async () => await Promise.resolve(reportResult(COVERAGE_EXIT_CODES.OK)),
      writeReport: async () => await Promise.resolve('/tmp/coverage.json'),
      ...overrides,
    },
  );
}

function reportResult(exitCode: CoverageExitCode): CoverageCheckResult {
  return { kind: 'REPORT', report: REPORT, exitCode };
}
