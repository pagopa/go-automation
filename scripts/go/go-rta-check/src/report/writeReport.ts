import { Core } from '@go-automation/go-common';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';

import type { AnalysisMatchSource, RtaCheckReport, RtaCheckRow } from '@go-automation/go-watchtower-runbook';

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
 * The output directory is per-process, while a session may analyse several
 * runbooks: `subdirectory` is what keeps each run's artifacts from overwriting
 * the previous ones.
 *
 * @param script - The GOScript (for path resolution + exporters)
 * @param report - The report to persist
 * @param formats - Which artifacts to write
 * @param subdirectory - Folder to write into, relative to the execution output directory
 * @returns The list of written file paths
 */
export async function writeReport(
  script: Core.GOScript,
  report: RtaCheckReport,
  formats: ReadonlyArray<OutputFormat>,
  subdirectory?: string,
): Promise<ReadonlyArray<string>> {
  const written: string[] = [];
  const resultsInfo = script.paths.resolvePathWithInfo('results.json', Core.GOPathType.OUTPUT);
  const baseDir = nodePath.dirname(resultsInfo.path);
  const outDir = subdirectory === undefined ? baseDir : nodePath.join(baseDir, subdirectory);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is confined to the execution output directory resolved by GOPaths.
  if (outDir !== baseDir) await fs.mkdir(outDir, { recursive: true });

  if (formats.includes('json')) {
    const resultsPath = nodePath.join(outDir, 'results.json');
    await new Core.GOJSONFileExporter({ outputPath: resultsPath, pretty: true, indent: 2 }).export(report);
    written.push(resultsPath);

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

/** Characters a folder name should not carry over from an alarm name. */
const UNSAFE_PATH_CHARS = /[^A-Za-z0-9._-]+/g;
/** Leading and trailing separators, dots included: `..` must never survive as a name. */
const EDGE_SEPARATORS = /^[-.]+|[-.]+$/g;
/** Long enough for every catalog alarm, short enough to stay under path limits. */
const MAX_SLUG_LENGTH = 80;

/**
 * Builds the folder name holding one run's artifacts: `01-pn-delivery-ApiGwAlarm`.
 *
 * The ordinal prefix keeps the runs in execution order even when the same
 * runbook is analysed twice, which sorting by name alone would not.
 *
 * @param index - 1-based position of the run in the session
 * @param alarmName - Alarm the run analysed
 * @returns A folder name safe on every filesystem
 *
 * @example
 * ```typescript
 * reportSubdirectory(2, 'pn-delivery/B2B Alarm'); // '02-pn-delivery-B2B-Alarm'
 * ```
 */
export function reportSubdirectory(index: number, alarmName: string): string {
  const slug = alarmName.replace(UNSAFE_PATH_CHARS, '-').replace(EDGE_SEPARATORS, '').slice(0, MAX_SLUG_LENGTH);
  const ordinal = String(index).padStart(2, '0');
  return slug === '' ? ordinal : `${ordinal}-${slug}`;
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
    matcher: formatMatchSource(row.comparison.matcher, row.comparison.aiAttempted),
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

function formatMatchSource(source: AnalysisMatchSource | undefined, aiAttempted: boolean | undefined): string {
  if (source !== undefined) return source;
  return aiAttempted === false ? 'n/a' : '';
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
