import { Core } from '@go-automation/go-common';
import type {
  DominantPatternReport,
  PatternCoverageReport,
  TiedPatternCombinationsReport,
  OccurrenceQueryResult,
} from '../types/PatternTypes.js';
import {
  DominantPatternReportModule,
  PatternCoverageReportModule,
  TiedPatternCombinationsReportModule,
} from './reports/index.js';

export interface GeneratedReports {
  readonly dominantReport: DominantPatternReport;
  readonly patternCoverageReport: PatternCoverageReport;
  readonly tiedCombinationsReport: TiedPatternCombinationsReport;
}

export interface AllReportsContainer {
  readonly dominantReports: ReadonlyArray<DominantPatternReport>;
  readonly patternCoverageReports: ReadonlyArray<PatternCoverageReport>;
  readonly tiedCombinationsReports: ReadonlyArray<TiedPatternCombinationsReport>;
}

/**
 * Builds all 3 report types for a given alarm analysis result.
 */
export function buildAllReports(
  profile: string,
  alarmName: string,
  occurrenceResults: ReadonlyArray<OccurrenceQueryResult>,
): GeneratedReports {
  const dominantReport = DominantPatternReportModule.buildReport(profile, alarmName, occurrenceResults);
  const patternCoverageReport = PatternCoverageReportModule.buildReport(profile, alarmName, occurrenceResults);
  const tiedCombinationsReport = TiedPatternCombinationsReportModule.buildReport(profile, alarmName, occurrenceResults);

  return {
    dominantReport,
    patternCoverageReport,
    tiedCombinationsReport,
  };
}

/**
 * Prints all 3 reports to the logger via their respective modules.
 */
export function printAllReports(script: Core.GOScript, reports: GeneratedReports): void {
  DominantPatternReportModule.printReport(script, reports.dominantReport);
  PatternCoverageReportModule.printReport(script, reports.patternCoverageReport);
  TiedPatternCombinationsReportModule.printReport(script, reports.tiedCombinationsReport);
}

/**
 * Exports a single report file to the script execution output directory using GOJSONFileExporter.
 */
export async function exportReportFile<T>(
  script: Core.GOScript,
  fileName: string,
  data: T,
): Promise<string> {
  const outputPath = script.paths.getExecutionOutputFilePath(fileName);
  const exporter = new Core.GOJSONFileExporter({
    outputPath,
    pretty: true,
    indent: 2,
  });

  await exporter.export(data);
  script.logger.info(`Report JSON salvato in: ${outputPath}`);
  return outputPath;
}

/**
 * Exports all reports to their dedicated JSON files in the execution output directory.
 */
export async function exportAllReports(
  script: Core.GOScript,
  reports: AllReportsContainer,
): Promise<{
  readonly dominantReportPath: string;
  readonly patternCoverageReportPath: string;
  readonly tiedCombinationsReportPath: string;
}> {
  const dominantReportPath = await exportReportFile(
    script,
    DominantPatternReportModule.REPORT_FILENAME,
    reports.dominantReports,
  );
  const patternCoverageReportPath = await exportReportFile(
    script,
    PatternCoverageReportModule.REPORT_FILENAME,
    reports.patternCoverageReports,
  );
  const tiedCombinationsReportPath = await exportReportFile(
    script,
    TiedPatternCombinationsReportModule.REPORT_FILENAME,
    reports.tiedCombinationsReports,
  );

  return {
    dominantReportPath,
    patternCoverageReportPath,
    tiedCombinationsReportPath,
  };
}
