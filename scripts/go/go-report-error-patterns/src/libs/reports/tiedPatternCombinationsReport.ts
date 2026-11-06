import { Core } from '@go-automation/go-common';
import type { TiedPatternCombinationsReport, OccurrenceQueryResult } from '../../types/PatternTypes.js';
import { aggregateTiedCombinations } from '../pattern-analyzer.js';

export const REPORT_TYPE = 'tied-pattern-combinations';

export const REPORT_DESCRIPTION =
  "Dettaglia le occorrenze in cui più pattern hanno condiviso il ratio massimo (pareggio), rendendo ambigua la selezione del pattern dominante nel Report A. Per ciascuna combinazione unica di pattern in pareggio, viene riportato quante volte si è verificata. Un'alta frequenza di una combinazione suggerisce che i pattern coinvolti siano manifestazioni dello stesso problema sottostante.";

export const REPORT_FILENAME = 'report-tied-pattern-combinations.json';

/**
 * Builds the Tied Pattern Combinations Report for a given profile, alarm name, and occurrence query results.
 */
export function buildReport(
  profile: string,
  alarmName: string,
  occurrenceResults: ReadonlyArray<OccurrenceQueryResult>,
): TiedPatternCombinationsReport {
  const aggregation = aggregateTiedCombinations(occurrenceResults);

  return {
    reportType: REPORT_TYPE,
    description: REPORT_DESCRIPTION,
    profile,
    alarmName,
    totalOccurrences: aggregation.totalOccurrences,
    message: aggregation.message,
    tiedCombinations: aggregation.tiedCombinations,
  };
}

/**
 * Prints the Tied Pattern Combinations Report to the logger.
 */
export function printReport(script: Core.GOScript, report: TiedPatternCombinationsReport): void {
  script.logger.section(`Report Tied Pattern Combinations - Profilo: ${report.profile}`);
  script.logger.info(`Nome allarme: ${report.alarmName}`);
  script.logger.info(`Metodologia: ${report.description}`);
  script.logger.info(`Numero totale di occorrenze allarme: ${report.totalOccurrences}`);

  if (report.totalOccurrences === 0) {
    script.logger.warning('Nessuna transizione di stato rilevata per i criteri specificati.');
    script.logger.newline();
    return;
  }

  script.logger.newline();

  if (report.tiedCombinations.length === 0) {
    script.logger.info('Nessuna occorrenza con pattern in pareggio rilevata nel periodo analizzato.');
  } else {
    const tableRows = report.tiedCombinations.map((item, idx) => ({
      '#': idx + 1,
      'Pattern in pareggio': item.patterns.join(' + '),
      Occorrenze: item.count,
      '% su occorrenze': `${item.percentage.toFixed(2)}%`,
    }));
    script.logger.simpleTable(tableRows);
  }

  script.logger.newline();
}
