import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import type { ProductDto, WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { CoverageIssue, CoverageIssueCode, CoverageReport } from '@go-automation/go-watchtower-runbook';

import { COVERAGE_EXIT_CODES, coverageExitCode, runCoverageCheck } from '../runCoverageCheck.js';

describe('coverageExitCode', () => {
  it('returns 0 when the completed report has no blocking errors', () => {
    assert.strictEqual(coverageExitCode(report()), COVERAGE_EXIT_CODES.OK);
  });

  it('returns 1 when the completed report finds invalid coverage', () => {
    assert.strictEqual(coverageExitCode(report(issue('RESOURCE_NOT_FOUND'))), COVERAGE_EXIT_CODES.INVALID_COVERAGE);
  });

  it('returns 2 when the product census is incomplete', () => {
    for (const code of ['PRODUCT_NOT_FOUND', 'PRODUCT_CENSUS_MISSING', 'PRODUCT_MAPPING_CONFLICT'] as const) {
      assert.strictEqual(coverageExitCode(report(issue(code))), COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
    }
  });
});

describe('runCoverageCheck', () => {
  it('returns 2 when no product is readable', async () => {
    const client = { listProducts: async () => await Promise.resolve([]) } as unknown as WatchtowerClient;

    const result = await runCoverageCheck(new Core.GOLogger([]), client);

    assert.deepStrictEqual(result, {
      kind: 'NOT_EXECUTABLE',
      exitCode: COVERAGE_EXIT_CODES.NOT_EXECUTABLE,
    });
  });

  it('returns 2 when loading a product census fails', async () => {
    const client = {
      listProducts: async () => await Promise.resolve([product('product-send', 'SEND')]),
      getProductCensus: async () => await Promise.reject(new Error('invalid census response')),
    } as unknown as WatchtowerClient;

    const result = await runCoverageCheck(new Core.GOLogger([]), client);

    assert.deepStrictEqual(result, {
      kind: 'NOT_EXECUTABLE',
      exitCode: COVERAGE_EXIT_CODES.NOT_EXECUTABLE,
    });
  });
});

function report(...errors: ReadonlyArray<CoverageIssue>): CoverageReport {
  return {
    checkedRunbooks: 1,
    checkedKnownCases: 1,
    checkedReferences: 1,
    errors,
    warnings: [],
  };
}

function issue(code: CoverageIssueCode): CoverageIssue {
  return { severity: 'ERROR', code, message: code };
}

function product(id: string, name: string): ProductDto {
  return {
    id,
    name,
    description: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
