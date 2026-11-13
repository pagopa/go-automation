/**
 * Exports `SearchResultItem[]` to a file using the appropriate go-common
 * exporter based on `GOExportFormat`. Mirrors the pattern adopted by
 * `scripts/send/send-report-dlq` so that callers can plug `output.file` /
 * `output.format` directly.
 */
import type { GOScript } from '@go-automation/go-script';
import {
  GOCSVListExporter,
  type GOExportFormat,
  GOFileListExporter,
  GOHTMLListExporter,
  GOJSONFileExporter,
  GOJSONListExporter,
  type GOListExporter,
} from '@pagopa/go-common/exporters';

import type { SearchResultItem } from '../types/SearchResultItem.js';

const COLUMN_ORDER: ReadonlyArray<keyof SearchResultItem> = [
  'issueKey',
  'summary',
  'projectKey',
  'attachmentId',
  'filename',
  'mimeType',
  'score',
  'snippet',
  'issueUrl',
  'attachmentUrl',
];

const COLUMN_HEADERS: Readonly<Record<keyof SearchResultItem, string>> = {
  issueKey: 'Issue Key',
  summary: 'Summary',
  projectKey: 'Project',
  attachmentId: 'Attachment ID',
  filename: 'Filename',
  mimeType: 'MIME Type',
  score: 'Score',
  snippet: 'Snippet',
  issueUrl: 'Issue URL',
  attachmentUrl: 'Attachment URL',
};

function columnMapper(name: string): string {
  return name in COLUMN_HEADERS ? COLUMN_HEADERS[name as keyof SearchResultItem] : name;
}

function formatRowAsText(row: SearchResultItem): string {
  const issueUrl = row.issueUrl.length > 0 ? `  (${row.issueUrl})` : '';
  return `[${row.issueKey}] ${row.filename} — ${row.snippet.replace(/\s+/g, ' ').trim()}${issueUrl}`;
}

/**
 * Writes the given results to `outputPath` using the exporter that matches
 * `format`. Emits an `export:completed` log line once done.
 */
export async function exportSearchResults(
  script: GOScript,
  results: ReadonlyArray<SearchResultItem>,
  outputPath: string,
  format: GOExportFormat,
): Promise<void> {
  const startedAt = Date.now();

  if (format === 'json') {
    const exporter = new GOJSONFileExporter({ outputPath, pretty: true, indent: 2 });
    await exporter.export({ generatedAt: new Date().toISOString(), count: results.length, results });
    script.logger.success(`Exported ${results.length} results to: ${outputPath} (${Date.now() - startedAt}ms)`);
    return;
  }

  if (format === 'txt') {
    const exporter = new GOFileListExporter({ outputPath });
    exporter.on('export:completed', (event) => {
      script.logger.success(`Exported ${event.totalItems} results to: ${event.destination} (${event.duration}ms)`);
    });
    await exporter.export(results.map(formatRowAsText));
    return;
  }

  const exporter = createStructuredExporter(outputPath, format);
  exporter.on('export:completed', (event) => {
    script.logger.success(`Exported ${event.totalItems} results to: ${event.destination} (${event.duration}ms)`);
  });
  // SearchResultItem fields are all assignable to unknown.
  await exporter.export(results as unknown as Record<string, unknown>[]);
}

function createStructuredExporter(
  outputPath: string,
  format: Exclude<GOExportFormat, 'json' | 'txt'>,
): GOListExporter<Record<string, unknown>> {
  switch (format) {
    case 'jsonl':
      return new GOJSONListExporter<Record<string, unknown>>({ outputPath, jsonl: true });
    case 'csv':
      return new GOCSVListExporter<Record<string, unknown>>({
        outputPath,
        includeHeader: true,
        delimiter: ',',
        columns: [...COLUMN_ORDER],
        columnMapper,
      });
    case 'html':
      return new GOHTMLListExporter<Record<string, unknown>>({ outputPath });
    default: {
      const exhaustive: never = format;
      throw new Error(`Unhandled export format: ${String(exhaustive)}`);
    }
  }
}
