import { buildApiGwOutputContext } from '../../toolkits/common/families/apigw/output/buildApiGwOutputContext.js';
import { buildLambdaOutputContext } from '../../toolkits/common/families/lambda/output/buildLambdaOutputContext.js';
import { buildServiceOutputContext } from '../../toolkits/common/families/service/output/buildServiceOutputContext.js';
import type { RunbookOutputContextBuilderFn } from '../../toolkits/common/output/buildRunbookOutput.js';

/** Shared context selection for catalog occurrences and CLI output. */
export const buildCatalogOutputContext: RunbookOutputContextBuilderFn = (runbook, result) =>
  buildApiGwOutputContext(runbook, result) ??
  buildLambdaOutputContext(runbook, result) ??
  buildServiceOutputContext(runbook, result);
