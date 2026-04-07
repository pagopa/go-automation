/**
 * DLQ Report Exporter
 *
 * Handles exporting DLQ statistics to JSON (grouped by profile), CSV, or HTML.
 */

import { AWS, Core } from '@go-automation/go-common';

import type { DLQReportRow } from '../types/index.js';
import { DLQ_REPORT_FORMATS, isDLQReportFormat } from '../types/index.js';

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
 * Creates a GOListExporter for the requested format.
 * Uses `Record<string, unknown>` as the generic parameter because CSV and HTML
 * exporters require an index signature that plain interfaces do not provide.
 *
 * @param outputPath - Resolved absolute output file path
 * @param format - Validated output format
 * @returns A configured exporter instance
 */
function createExporter(outputPath: string, format: string): Core.GOListExporter<Record<string, unknown>> {
  if (!isDLQReportFormat(format)) {
    throw new Error(`Invalid output format "${format}". Valid values: ${DLQ_REPORT_FORMATS.join(', ')}`);
  }

  switch (format) {
    case 'json':
      return new Core.GOJSONListExporter<Record<string, unknown>>({ outputPath, pretty: true });

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
 * JSON format produces a grouped-by-profile structure; CSV/HTML produce flat rows.
 *
 * @param script - The GOScript instance for logging
 * @param results - Map of profile → DLQ stats
 * @param outputPath - Resolved absolute output file path
 * @param format - Validated output format string
 */
export async function exportReport(
  script: Core.GOScript,
  results: ReadonlyMap<string, ReadonlyArray<AWS.DLQStats>>,
  outputPath: string,
  format: string,
): Promise<void> {
  if (format === 'json') {
    await exportJsonGrouped(script, results, outputPath);
    return;
  }

  // CSV / HTML: flat rows
  const rows = buildReportRows(results);
  const exporter = createExporter(outputPath, format);

  exporter.on('export:completed', (event) => {
    script.logger.success(`Exported ${event.totalItems} rows to: ${event.destination} (${event.duration}ms)`);
  });

  // Double cast needed: readonly DLQReportRow[] → unknown → Record<string, unknown>[]
  // Safe because DLQReportRow properties are all assignable to unknown
  await exporter.export(rows as unknown as Record<string, unknown>[]);
}
