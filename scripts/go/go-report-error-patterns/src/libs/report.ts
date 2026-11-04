import { Core } from '@go-automation/go-common';
import type { AlarmOccurrencePatternReport } from '../types/PatternTypes.js';

export const DEFAULT_REPORT_FILENAME = 'error-patterns-report.json';

/**
 * Prints a formatted summary table of the patterns report to the logger.
 * Sezione con:
 * - Nome allarme
 * - Numero di transizioni di stato (attivazioni dell'allarme)
 * - Numero totale di pattern individuati
 * Tabella con la percentuale di presenza di ciascun pattern calcolata sul totale dei pattern.
 */
export function printPatternReport(script: Core.GOScript, report: AlarmOccurrencePatternReport): void {
  script.logger.section(`Report Pattern Allarmi - Profilo: ${report.profile}`);
  script.logger.info(`Nome allarme: ${report.alarmName}`);
  script.logger.info(`Numero di transizioni di stato (attivazioni dell'allarme): ${report.totalOccurrences}`);
  script.logger.info(`Numero totale di pattern individuati: ${report.totalPatternsCount}`);

  if (report.totalOccurrences === 0) {
    script.logger.warning('Nessuna transizione di stato rilevata per i criteri specificati.');
    return;
  }

  script.logger.newline();

  if (report.patternFrequency.length === 0) {
    script.logger.warning('Nessun pattern individuato nei log durante le finestre temporali analizzate.');
  } else {
    const tableRows = report.patternFrequency.map((p, idx) => ({
      '#': idx + 1,
      Pattern: p.pattern.length > 120 ? `${p.pattern.slice(0, 117)}...` : p.pattern,
      Occorrenze: p.count,
      'Percentuale Presenza': `${p.percentage.toFixed(2)}%`,
    }));
    script.logger.simpleTable(tableRows);
  }

  script.logger.newline();
}

/**
 * Exports the pattern reports to a JSON file in the script execution output directory.
 *
 * @param script - The GOScript instance
 * @param reports - Array of reports to export
 * @returns Path of the exported file
 */
export async function exportPatternReports(
  script: Core.GOScript,
  reports: ReadonlyArray<AlarmOccurrencePatternReport>,
): Promise<string> {
  const outputPath = script.paths.getExecutionOutputFilePath(DEFAULT_REPORT_FILENAME);
  const exporter = new Core.GOJSONFileExporter({
    outputPath,
    pretty: true,
    indent: 2,
  });

  await exporter.export(reports);
  script.logger.info(`Report JSON salvato in: ${outputPath}`);
  return outputPath;
}
