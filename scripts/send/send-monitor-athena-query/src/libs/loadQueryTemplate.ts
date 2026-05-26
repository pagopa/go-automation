import { readFile } from 'node:fs/promises';

import { Core } from '@go-automation/go-common';

import type { SendMonitorAthenaQueryConfig } from '../types/index.js';

export async function loadQueryTemplate(config: SendMonitorAthenaQueryConfig, paths: Core.GOPaths): Promise<string> {
  const inlineQuery = normalizeOptionalText(config.athenaQuery);
  const queryFile = normalizeOptionalText(config.athenaQueryFile);

  if (
    (inlineQuery === undefined && queryFile === undefined) ||
    (inlineQuery !== undefined && queryFile !== undefined)
  ) {
    throw new Error('Provide exactly one of athena.query or athena.query.file');
  }

  if (inlineQuery !== undefined) {
    return inlineQuery;
  }

  if (queryFile === undefined) {
    throw new Error('athena.query.file is required when athena.query is not provided');
  }

  const filePath = paths.resolvePath(queryFile, Core.GOPathType.CONFIG);
  return readFile(filePath, 'utf8');
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
