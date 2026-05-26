import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Core } from '@go-automation/go-common';

import type { ReportArtifact, ReportFormat, SendMonitorAthenaQueryConfig } from '../types/index.js';

export async function writeResultArtifact(
  rows: ReadonlyArray<Record<string, string>>,
  config: SendMonitorAthenaQueryConfig,
  paths: Core.GOPaths,
): Promise<ReportArtifact> {
  const format: ReportFormat = config.outputFormat;
  const extension = format === 'jsonl' ? 'jsonl' : format;
  const fileName = paths.getOutputFileName(sanitizeFilePrefix(config.outputFilePrefix), extension);
  const filePath = resolveOutputPath(config.outputFolder, fileName, paths);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- output path is generated through GOPaths or explicit operator-provided absolute path.
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
  const sanitized = trimHyphens(replaceUnsafeFilePrefixChars(prefix.trim()));
  return sanitized.length > 0 ? sanitized : 'athena-report';
}

function replaceUnsafeFilePrefixChars(value: string): string {
  let result = '';
  let previousWasReplacement = false;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (isSafeFilePrefixChar(code)) {
      result += value[index] ?? '';
      previousWasReplacement = false;
    } else if (!previousWasReplacement) {
      result += '-';
      previousWasReplacement = true;
    }
  }

  return result;
}

function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value.charCodeAt(start) === 45) {
    start++;
  }

  while (end > start && value.charCodeAt(end - 1) === 45) {
    end--;
  }

  return value.slice(start, end);
}

function isSafeFilePrefixChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 45 ||
    code === 46 ||
    code === 95
  );
}
