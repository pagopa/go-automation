import type { Core } from '@go-automation/go-common';
import { valueToString } from '@go-automation/go-common/core';
import { AUTOMATIC_RUNBOOK_REGISTRY } from '@go-automation/go-runbook/catalog';
import type { ProductCensus, WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { CoverageReport } from '@go-automation/go-watchtower-runbook';
import { checkRunbookCoverage, COVERAGE_ERROR_CODES } from '@go-automation/go-watchtower-runbook';

/** Process contract of the coverage mode: warnings never change the result. */
export const COVERAGE_EXIT_CODES = {
  OK: 0,
  INVALID_COVERAGE: 1,
  NOT_EXECUTABLE: 2,
} as const;

export type CoverageExitCode = (typeof COVERAGE_EXIT_CODES)[keyof typeof COVERAGE_EXIT_CODES];

/** Outcome of loading and evaluating coverage, before CLI rendering and persistence. */
export type CoverageCheckResult =
  | {
      readonly kind: 'REPORT';
      readonly report: CoverageReport;
      readonly exitCode: CoverageExitCode;
    }
  | {
      readonly kind: 'NOT_EXECUTABLE';
      readonly exitCode: typeof COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
    };

/** Findings proving that the census itself was not complete enough to run the check. */
const INCOMPLETE_CENSUS_CODES = new Set<string>([
  COVERAGE_ERROR_CODES.PRODUCT_NOT_FOUND,
  COVERAGE_ERROR_CODES.PRODUCT_CENSUS_MISSING,
  COVERAGE_ERROR_CODES.PRODUCT_MAPPING_CONFLICT,
]);

/**
 * Loads the Watchtower census of every product, compares it with the runbook
 * declarations and returns the data needed by the CLI adapter.
 *
 * Read-only: no AWS profile, no runbook execution, no CloudWatch query and no
 * mutation on Watchtower.
 *
 * @param logger - GOScript logger
 * @param client - Authenticated Watchtower client
 * @returns A report plus exit code when evaluated, otherwise a non-executable outcome
 */
export async function runCoverageCheck(logger: Core.GOLogger, client: WatchtowerClient): Promise<CoverageCheckResult> {
  try {
    logger.info('Caricamento censimento Watchtower …');
    const products = await client.listProducts();
    if (products.length === 0) {
      logger.error('Nessun prodotto leggibile su Watchtower: controlla i permessi delle credenziali.');
      return { kind: 'NOT_EXECUTABLE', exitCode: COVERAGE_EXIT_CODES.NOT_EXECUTABLE };
    }

    const census: ProductCensus[] = [];
    for (const product of products) {
      census.push(await client.getProductCensus(product.id));
    }
    const ignoreReasons = await client.listIgnoreReasons();

    const report = await checkRunbookCoverage({
      registry: AUTOMATIC_RUNBOOK_REGISTRY,
      products,
      census,
      ignoreReasons,
    });
    return { kind: 'REPORT', report, exitCode: coverageExitCode(report) };
  } catch (error) {
    logger.error(`Coverage non eseguibile: ${valueToString(error)}`);
    return { kind: 'NOT_EXECUTABLE', exitCode: COVERAGE_EXIT_CODES.NOT_EXECUTABLE };
  }
}

/** Maps a completed coverage report to the public process contract. */
export function coverageExitCode(report: CoverageReport): CoverageExitCode {
  if (report.errors.some((issue) => INCOMPLETE_CENSUS_CODES.has(issue.code))) {
    return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
  }
  return report.errors.length === 0 ? COVERAGE_EXIT_CODES.OK : COVERAGE_EXIT_CODES.INVALID_COVERAGE;
}
