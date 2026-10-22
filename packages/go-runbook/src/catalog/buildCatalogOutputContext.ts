import { buildApiGwOutputContext } from '../apigw/output/buildApiGwOutputContext.js';
import { buildLambdaOutputContext } from '../lambda/output/buildLambdaOutputContext.js';
import { buildServiceOutputContext } from '../service/output/buildServiceOutputContext.js';
import type { RunbookOutputContextBuilderFn } from '../output/buildRunbookOutput.js';

/** Shared context selection for catalog occurrences and CLI output. */
export const buildCatalogOutputContext: RunbookOutputContextBuilderFn = (runbook, result) =>
  buildApiGwOutputContext(runbook, result) ??
  buildLambdaOutputContext(runbook, result) ??
  buildServiceOutputContext(runbook, result);
