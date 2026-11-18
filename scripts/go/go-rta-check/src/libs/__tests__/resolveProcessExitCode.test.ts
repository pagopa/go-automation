import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveProcessExitCode } from '../resolveProcessExitCode.js';
import { COVERAGE_EXIT_CODES } from '../runCoverageCheck.js';
import type { CoverageExitCode } from '../runCoverageCheck.js';

const { OK, INVALID_COVERAGE, NOT_EXECUTABLE } = COVERAGE_EXIT_CODES;

const CASES: ReadonlyArray<readonly [string, CoverageExitCode, boolean, CoverageExitCode]> = [
  ['da terminale un verdetto negativo non fa sembrare fallito il comando', INVALID_COVERAGE, false, OK],
  ['in CI il verdetto negativo esce, perché è ciò che ferma la pipeline', INVALID_COVERAGE, true, INVALID_COVERAGE],
  ['un guasto esce sempre da terminale', NOT_EXECUTABLE, false, NOT_EXECUTABLE],
  ['un guasto esce sempre in CI', NOT_EXECUTABLE, true, NOT_EXECUTABLE],
  ['un esito conforme resta zero da terminale', OK, false, OK],
  ['un esito conforme resta zero in CI', OK, true, OK],
];

describe('resolveProcessExitCode', () => {
  for (const [name, exitCode, ci, expected] of CASES) {
    it(name, () => {
      assert.strictEqual(resolveProcessExitCode(exitCode, ci), expected);
    });
  }
});
