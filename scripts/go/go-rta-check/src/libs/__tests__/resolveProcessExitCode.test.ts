import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveProcessExitCode } from '../resolveProcessExitCode.js';
import { COVERAGE_EXIT_CODES } from '../runCoverageCheck.js';

describe('resolveProcessExitCode', () => {
  it('da terminale un verdetto negativo non fa sembrare fallito il comando', () => {
    assert.equal(resolveProcessExitCode(COVERAGE_EXIT_CODES.INVALID_COVERAGE, false), COVERAGE_EXIT_CODES.OK);
  });

  it('in CI il verdetto negativo esce, perché è ciò che ferma la pipeline', () => {
    assert.equal(
      resolveProcessExitCode(COVERAGE_EXIT_CODES.INVALID_COVERAGE, true),
      COVERAGE_EXIT_CODES.INVALID_COVERAGE,
    );
  });

  it('un guasto esce sempre: non è un giudizio sul risultato, è il comando che non ha funzionato', () => {
    assert.equal(resolveProcessExitCode(COVERAGE_EXIT_CODES.NOT_EXECUTABLE, false), COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
    assert.equal(resolveProcessExitCode(COVERAGE_EXIT_CODES.NOT_EXECUTABLE, true), COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
  });

  it('un esito conforme resta zero in entrambi i casi', () => {
    assert.equal(resolveProcessExitCode(COVERAGE_EXIT_CODES.OK, false), COVERAGE_EXIT_CODES.OK);
    assert.equal(resolveProcessExitCode(COVERAGE_EXIT_CODES.OK, true), COVERAGE_EXIT_CODES.OK);
  });
});
