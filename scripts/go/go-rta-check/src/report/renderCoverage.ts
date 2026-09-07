import type { Core } from '@go-automation/go-common';
import type { CoverageIssue, CoverageReport } from '@go-automation/go-watchtower-runbook';

/**
 * Prints the coverage report: counters first, then errors and drift warnings.
 *
 * @param logger - GOScript logger
 * @param report - The data-only report produced by the library
 */
export function renderCoverage(logger: Core.GOLogger, report: CoverageReport): void {
  logger.section('Copertura dichiarazioni ↔ censimento');
  logger.info(`Runbook analizzati: ${report.checkedRunbooks}`);
  logger.info(`Casi noti analizzati: ${report.checkedKnownCases}`);
  logger.info(`Riferimenti verificati: ${report.checkedReferences}`);

  if (report.errors.length > 0) {
    logger.section(`Errori bloccanti (${report.errors.length})`);
    for (const issue of report.errors) logger.error(formatIssue(issue));
  }

  if (report.warnings.length > 0) {
    logger.section(`Warning di drift (${report.warnings.length})`);
    for (const issue of report.warnings) logger.warning(formatIssue(issue));
  }

  if (report.errors.length === 0) {
    logger.success(
      report.warnings.length === 0
        ? 'Copertura completa: nessun errore, nessun drift.'
        : 'Copertura valida: nessun errore bloccante, solo drift da valutare.',
    );
  }
}

/**
 * Renders one issue on a single line.
 *
 * @param issue - The coverage finding
 * @returns The formatted line
 */
function formatIssue(issue: CoverageIssue): string {
  const location = [issue.runbookKey, issue.knownCaseId, issue.field].filter(isPresent).join(' · ');
  const suggestion = issue.suggestedValue === undefined ? '' : ` — forse "${issue.suggestedValue}"?`;
  return `[${issue.code}] ${location === '' ? '' : `${location}: `}${issue.message}${suggestion}`;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}
