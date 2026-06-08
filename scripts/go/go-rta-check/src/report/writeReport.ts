import { Core } from '@go-automation/go-common';
import * as nodePath from 'node:path';

import type { RtaCheckReport, RtaCheckRow } from '../types/RtaCheckReport.js';

/** Report artifact formats. */
export type OutputFormat = 'json' | 'html';

/** Flat record used for the HTML report table. */
interface ReportHtmlRow extends Record<string, unknown> {
  readonly firedAt: string;
  readonly v1: string;
  readonly caso: string;
  readonly v2: string;
  readonly confidence: string;
  readonly matcher: string;
  readonly aiAttempted: string;
  readonly aiFallback: string;
  readonly aiError: string;
  readonly semanticScore: string;
  readonly aiVerdict: string;
  readonly aiExplanation: string;
  readonly aiDetail: string;
  readonly note: string;
}

/**
 * Writes the report artifacts (`results.json`, `summary.json`, `report.html`)
 * into the run's output directory, using go-common exporters.
 *
 * @param script - The GOScript (for path resolution + exporters)
 * @param report - The report to persist
 * @param formats - Which artifacts to write
 * @returns The list of written file paths
 */
export async function writeReport(
  script: Core.GOScript,
  report: RtaCheckReport,
  formats: ReadonlyArray<OutputFormat>,
): Promise<ReadonlyArray<string>> {
  const written: string[] = [];
  const resultsInfo = script.paths.resolvePathWithInfo('results.json', Core.GOPathType.OUTPUT);
  const outDir = nodePath.dirname(resultsInfo.path);

  if (formats.includes('json')) {
    await new Core.GOJSONFileExporter({ outputPath: resultsInfo.path, pretty: true, indent: 2 }).export(report);
    written.push(resultsInfo.path);

    const summaryPath = nodePath.join(outDir, 'summary.json');
    await new Core.GOJSONFileExporter({ outputPath: summaryPath, pretty: true, indent: 2 }).export({
      schemaVersion: report.schemaVersion,
      generatedAt: report.generatedAt,
      input: report.input,
      summary: report.summary,
    });
    written.push(summaryPath);
  }

  if (formats.includes('html')) {
    const htmlPath = nodePath.join(outDir, 'report.html');
    const rows: ReadonlyArray<ReportHtmlRow> = report.rows.map(toHtmlRow);
    await new Core.GOHTMLListExporter<ReportHtmlRow>({ outputPath: htmlPath }).export(rows);
    written.push(htmlPath);
  }

  return written;
}

export function toHtmlRow(row: RtaCheckRow): ReportHtmlRow {
  const runbook = row.runbook;
  const semanticScore = row.comparison.signals.semanticScore;
  const semanticVerdict = row.comparison.signals.semanticVerdict;
  return {
    firedAt: row.event.firedAt,
    v1: runbook.status,
    caso: runbook.primaryCaseId ?? '',
    v2: row.comparison.status,
    confidence: row.comparison.confidence.toFixed(2),
    matcher: row.comparison.matcher ?? (row.comparison.aiAttempted === false ? 'n/a' : ''),
    aiAttempted: row.comparison.aiAttempted === undefined ? '' : row.comparison.aiAttempted === true ? 'true' : 'false',
    aiFallback: row.comparison.aiFallback === true ? 'true' : '',
    aiError: row.comparison.aiError ?? '',
    semanticScore: semanticScore !== undefined ? semanticScore.toFixed(0) : '',
    aiVerdict: semanticVerdict ?? '',
    aiExplanation: row.comparison.semanticExplanation ?? '',
    aiDetail: formatAiDetail(row),
    note:
      runbook.error ?? row.comparison.aiError ?? row.comparison.semanticExplanation ?? row.comparison.reasons[0] ?? '',
  };
}

function formatAiDetail(row: RtaCheckRow): string {
  const comparison = row.comparison;
  const detail = {
    attempted: comparison.aiAttempted ?? false,
    matcher: comparison.matcher ?? null,
    fallback: comparison.aiFallback ?? false,
    status: comparison.status,
    confidence: comparison.confidence,
    semanticScore: comparison.signals.semanticScore ?? null,
    semanticVerdict: comparison.signals.semanticVerdict ?? null,
    explanation: comparison.semanticExplanation ?? null,
    error: comparison.aiError ?? null,
    reasons: comparison.reasons,
  };

  return JSON.stringify(detail, null, 2);
}
