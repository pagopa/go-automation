import { Core } from '@go-automation/go-common';
import type { DominantPatternReport, OccurrenceQueryResult } from '../../types/PatternTypes.js';
import { aggregateDominantPatterns } from '../pattern-analyzer.js';

export const REPORT_TYPE = 'dominant-pattern';

export const REPORT_DESCRIPTION =
  "Per ogni occorrenza dell'allarme, viene identificato il pattern con il valore di ratio più alto (percentuale di presenza nei log analizzati per quella finestra temporale). I pattern dominanti estratti da tutte le occorrenze vengono poi aggregati per determinare quale pattern è stato la causa principale dell'attivazione dell'allarme con maggiore frequenza. In caso di pareggio tra due o più pattern con lo stesso ratio massimo, viene scelto il primo nell'array restituito dalla query CloudWatch e l'occorrenza viene marcata con asterisco (*) nel Report C — Tied Pattern Combinations.";

export const REPORT_FILENAME = 'report-dominant-pattern.json';

/**
 * Builds the Dominant Pattern Report for a given profile, alarm name, and occurrence query results.
 */
export function buildReport(
  profile: string,
  alarmName: string,
  occurrenceResults: ReadonlyArray<OccurrenceQueryResult>,
): DominantPatternReport {
  const aggregation = aggregateDominantPatterns(occurrenceResults);

  return {
    reportType: REPORT_TYPE,
    description: REPORT_DESCRIPTION,
    profile,
    alarmName,
    totalOccurrences: aggregation.totalOccurrences,
    occurrencesWithPatterns: aggregation.occurrencesWithPatterns,
    occurrencesWithoutPatterns: aggregation.occurrencesWithoutPatterns,
    dominantPatterns: aggregation.dominantPatterns,
  };
}

/**
 * Prints the Dominant Pattern Report to the logger.
 */
export function printReport(script: Core.GOScript, report: DominantPatternReport): void {
  script.logger.section(`Report Dominant Pattern - Profilo: ${report.profile}`);
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

  if (report.dominantPatterns.length === 0) {
    script.logger.warning('Nessun pattern individuato nei log durante le finestre temporali analizzate.');
  } else {
    const tableRows = report.dominantPatterns.map((p, idx) => ({
      '#': idx + 1,
      Pattern: p.pattern.length > 120 ? `${p.pattern.slice(0, 117)}...` : p.pattern,
      'Volte dominante': p.count,
      '% su occorrenze': `${p.percentage.toFixed(2)}%`,
      Note: p.hasTies ? '*' : '',
    }));
    script.logger.simpleTable(tableRows);

    if (report.dominantPatterns.some((p) => p.hasTies)) {
      script.logger.newline();
      script.logger.info('* = selezionato in presenza di pareggio (vedi Report C per il dettaglio)');
    }
  }

  script.logger.newline();
}
