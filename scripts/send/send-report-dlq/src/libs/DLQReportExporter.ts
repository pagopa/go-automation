/**
 * DLQ Report Exporter
 *
 * Handles exporting DLQ statistics to JSON, JSONL, CSV, HTML, or TXT.
 */

import { AWS, Core } from '@go-automation/go-common';

import type { DLQReportRow } from '../types/index.js';

// ============================================================================
// Internals
// ============================================================================

/** Column names for DLQReportRow in display order */
const CSV_COLUMNS: ReadonlyArray<string> = ['profile', 'queueName', 'messageCount', 'ageOfOldestMessageDays'];

/** Maps property names to human-readable CSV/HTML headers */
function columnMapper(name: string): string {
  const map: Record<string, string> = {
    profile: 'Profile',
    queueName: 'Queue Name',
    messageCount: 'Messages',
    ageOfOldestMessageDays: 'Age (days)',
  };
  return map[name] ?? name;
}

/**
 * Creates a GOListExporter for structured record formats.
 *
 * @param outputPath - Resolved absolute output file path
 * @param format - Export format (json and txt are handled before this)
 * @returns A configured exporter instance
 */
function createStructuredExporter(
  outputPath: string,
  format: Exclude<Core.GOExportFormat, 'json' | 'txt'>,
): Core.GOListExporter<Record<string, unknown>> {
  switch (format) {
    case 'jsonl':
      return new Core.GOJSONListExporter<Record<string, unknown>>({ outputPath, jsonl: true });

    case 'csv':
      return new Core.GOCSVListExporter<Record<string, unknown>>({
        outputPath,
        includeHeader: true,
        delimiter: ',',
        columns: [...CSV_COLUMNS],
        columnMapper,
      });

    case 'html':
      return new Core.GOHTMLListExporter<Record<string, unknown>>({ outputPath });

    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled format: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Formats a DLQReportRow as a single text line.
 *
 * @param row - Report row to format
 * @returns Formatted text line
 */
function formatRowAsText(row: DLQReportRow): string {
  return `${row.profile} | ${row.queueName} | ${row.messageCount} msgs | age: ${row.ageOfOldestMessageDays} days`;
}

/**
 * Flattens per-profile DLQ stats into a list of exportable rows.
 *
 * @param results - Map of profile → DLQ stats
 * @returns Flat array of report rows
 */
function buildReportRows(results: ReadonlyMap<string, ReadonlyArray<AWS.DLQStats>>): ReadonlyArray<DLQReportRow> {
  const rows: DLQReportRow[] = [];

  for (const [profile, stats] of results) {
    for (const stat of stats) {
      rows.push({
        profile,
        queueName: stat.queueName,
        messageCount: stat.messageCount,
        ageOfOldestMessageDays: stat.ageOfOldestMessageDays ?? 'N/A',
      });
    }
  }

  return rows;
}

/**
 * Exports DLQ results to a grouped JSON file.
 *
 * Output structure:
 * ```json
 * {
 *   "generatedAt": "2024-01-01T00:00:00.000Z",
 *   "profiles": {
 *     "sso_pn-core-dev": [
 *       { "queueName": "...", "queueUrl": "...", "messageCount": 42, "ageOfOldestMessageDays": 3 }
 *     ]
 *   }
 * }
 * ```
 *
 * @param script - The GOScript instance for logging
 * @param results - Map of profile → DLQ stats
 * @param outputPath - Resolved absolute output file path
 */
async function exportJsonGrouped(
  script: Core.GOScript,
  results: ReadonlyMap<string, ReadonlyArray<AWS.DLQStats>>,
  outputPath: string,
): Promise<void> {
  const profiles: Record<string, unknown> = {};
  let totalRows = 0;

  for (const [profile, stats] of results) {
    profiles[profile] = stats.map((stat) => ({
      queueName: stat.queueName,
      messageCount: stat.messageCount,
      ageOfOldestMessageDays: stat.ageOfOldestMessageDays ?? null,
    }));
    totalRows += stats.length;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    profiles,
  };

  const startTime = Date.now();
  const exporter = new Core.GOJSONFileExporter({ outputPath, pretty: true, indent: 2 });
  await exporter.export(output);
  const duration = Date.now() - startTime;

  script.logger.success(`Exported ${totalRows} rows to: ${outputPath} (${duration}ms)`);
}

// ============================================================================
// Public
// ============================================================================

/**
 * Exports DLQ results to a file.
 * JSON format produces a grouped-by-profile structure; other formats produce flat rows.
 *
 * @param script - The GOScript instance for logging
 * @param results - Map of profile → DLQ stats
 * @param outputPath - Resolved absolute output file path
 * @param format - Validated output format
 */
export async function exportReport(
  script: Core.GOScript,
  results: ReadonlyMap<string, ReadonlyArray<AWS.DLQStats>>,
  outputPath: string,
  format: Core.GOExportFormat,
): Promise<void> {
  if (format === 'json') {
    await exportJsonGrouped(script, results, outputPath);
    return;
  }

  const rows = buildReportRows(results);

  if (format === 'txt') {
    const textExporter = new Core.GOFileListExporter({ outputPath });
    textExporter.on('export:completed', (event) => {
      script.logger.success(`Exported ${event.totalItems} rows to: ${event.destination} (${event.duration}ms)`);
    });
    await textExporter.export(rows.map(formatRowAsText));
    return;
  }

  const exporter = createStructuredExporter(outputPath, format);

  exporter.on('export:completed', (event) => {
    script.logger.success(`Exported ${event.totalItems} rows to: ${event.destination} (${event.duration}ms)`);
  });

  // Double cast needed: readonly DLQReportRow[] → unknown → Record<string, unknown>[]
  // Safe because DLQReportRow properties are all assignable to unknown
  await exporter.export(rows as unknown as Record<string, unknown>[]);
}
