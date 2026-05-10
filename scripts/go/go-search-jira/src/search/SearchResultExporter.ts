/**
 * Exports `SearchResultItem[]` to a file using the appropriate go-common
 * exporter based on `Core.GOExportFormat`. Mirrors the pattern adopted by
 * `scripts/send/send-report-dlq` so that callers can plug `output.file` /
 * `output.format` directly.
 */
import { Core } from '@go-automation/go-common';

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
  return `[${row.issueKey}] ${row.filename} — ${row.snippet.replace(/\s+/g, ' ').trim()}  (${row.issueUrl})`;
}

/**
 * Writes the given results to `outputPath` using the exporter that matches
 * `format`. Emits an `export:completed` log line once done.
 */
export async function exportSearchResults(
  script: Core.GOScript,
  results: ReadonlyArray<SearchResultItem>,
  outputPath: string,
  format: Core.GOExportFormat,
): Promise<void> {
  const startedAt = Date.now();

  if (format === 'json') {
    const exporter = new Core.GOJSONFileExporter({ outputPath, pretty: true, indent: 2 });
    await exporter.export({ generatedAt: new Date().toISOString(), count: results.length, results });
    script.logger.success(`Exported ${results.length} results to: ${outputPath} (${Date.now() - startedAt}ms)`);
    return;
  }

  if (format === 'txt') {
    const exporter = new Core.GOFileListExporter({ outputPath });
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
        columns: [...COLUMN_ORDER],
        columnMapper,
      });
    case 'html':
      return new Core.GOHTMLListExporter<Record<string, unknown>>({ outputPath });
    default: {
      const exhaustive: never = format;
      throw new Error(`Unhandled export format: ${String(exhaustive)}`);
    }
  }
}
