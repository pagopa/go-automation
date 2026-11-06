import { Core } from '@go-automation/go-common';
import type { PatternCoverageReport, OccurrenceQueryResult } from '../../types/PatternTypes.js';
import { aggregatePatternCoverage } from '../pattern-analyzer.js';

export const REPORT_TYPE = 'pattern-coverage';

export const REPORT_DESCRIPTION =
  "Per ogni pattern trovato, viene contato in quante occorrenze distinte dell'allarme è comparso, indipendentemente dal suo ratio in quella specifica occorrenza. Questo misura la 'trasversalità' di un pattern: un pattern con copertura alta è presente in molte attivazioni dell'allarme, anche se non sempre è il responsabile principale. La percentuale è calcolata sul totale delle occorrenze analizzate (incluse quelle senza pattern nei log).";

export const REPORT_FILENAME = 'report-pattern-coverage.json';

/**
 * Builds the Pattern Coverage Report for a given profile, alarm name, and occurrence query results.
 */
export function buildReport(
  profile: string,
  alarmName: string,
  occurrenceResults: ReadonlyArray<OccurrenceQueryResult>,
): PatternCoverageReport {
  const aggregation = aggregatePatternCoverage(occurrenceResults);

  return {
    reportType: REPORT_TYPE,
    description: REPORT_DESCRIPTION,
    profile,
    alarmName,
    totalOccurrences: aggregation.totalOccurrences,
    occurrencesWithPatterns: aggregation.occurrencesWithPatterns,
    occurrencesWithoutPatterns: aggregation.occurrencesWithoutPatterns,
    patternCoverage: aggregation.patternCoverage,
  };
}

/**
 * Prints the Pattern Coverage Report to the logger.
 */
export function printReport(script: Core.GOScript, report: PatternCoverageReport): void {
  script.logger.section(`Report Pattern Coverage - Profilo: ${report.profile}`);
  script.logger.info(`Nome allarme: ${report.alarmName}`);
  script.logger.info(`Metodologia: ${report.description}`);
  script.logger.info(`Numero totale di occorrenze allarme: ${report.totalOccurrences}`);
  script.logger.info(`Occorrenze con pattern nei log: ${report.occurrencesWithPatterns}`);
  script.logger.info(`Occorrenze senza pattern nei log: ${report.occurrencesWithoutPatterns}`);

  if (report.totalOccurrences === 0) {
    script.logger.warning('Nessuna transizione di stato rilevata per i criteri specificati.');
    script.logger.newline();
    return;
  }

  script.logger.newline();

  if (report.patternCoverage.length === 0) {
    script.logger.warning('Nessun pattern individuato nei log durante le finestre temporali analizzate.');
  } else {
    const tableRows = report.patternCoverage.map((p, idx) => ({
      '#': idx + 1,
      Pattern: p.pattern.length > 120 ? `${p.pattern.slice(0, 117)}...` : p.pattern,
      'Occorrenze con presenza': p.count,
      '% su occorrenze': `${p.percentage.toFixed(2)}%`,
    }));
    script.logger.simpleTable(tableRows);
  }

  script.logger.newline();
}
