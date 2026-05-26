import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Core } from '@go-automation/go-common';

import type { ReportArtifact, ReportFormat, SendMonitorAthenaQueryConfig } from '../types/index.js';

export async function writeResultArtifact(
  rows: ReadonlyArray<Record<string, string>>,
  config: SendMonitorAthenaQueryConfig,
  paths: Core.GOPaths,
): Promise<ReportArtifact> {
  const format = config.outputFormat as ReportFormat;
  const extension = format === 'jsonl' ? 'jsonl' : format;
  const fileName = paths.getOutputFileName(sanitizeFilePrefix(config.outputFilePrefix), extension);
  const filePath = resolveOutputPath(config.outputFolder, fileName, paths);

  await mkdir(path.dirname(filePath), { recursive: true });

  if (format === 'csv') {
    const exporter = new Core.GOCSVListExporter<Record<string, unknown>>({
      outputPath: filePath,
      includeHeader: true,
    });
    await exporter.export(rows.map((row) => ({ ...row })));
  } else {
    const exporter = new Core.GOJSONListExporter<Record<string, string>>({
      outputPath: filePath,
      pretty: format === 'json',
      jsonl: format === 'jsonl',
    });
    await exporter.export(rows);
  }

  return {
    filePath,
    fileName,
    format,
    rowCount: rows.length,
  };
}

function resolveOutputPath(outputFolder: string, fileName: string, paths: Core.GOPaths): string {
  return path.isAbsolute(outputFolder)
    ? path.join(outputFolder, fileName)
    : paths.resolvePath(path.join(outputFolder, fileName), Core.GOPathType.OUTPUT);
}

function sanitizeFilePrefix(prefix: string): string {
  const sanitized = prefix
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'athena-report';
}
