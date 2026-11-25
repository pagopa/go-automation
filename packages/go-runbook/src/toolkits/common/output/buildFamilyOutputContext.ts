import type { Runbook, RunbookExecutionResult } from '../../../engine/index.js';
import { buildApiGwOutputContext } from '../families/apigw/output/buildApiGwOutputContext.js';
import { buildLambdaOutputContext } from '../families/lambda/output/buildLambdaOutputContext.js';
import { buildServiceOutputContext } from '../families/service/output/buildServiceOutputContext.js';
import type { RunbookOutputContext } from './RunbookOutputContext.js';

/**
 * The output context of the family that built the runbook (API Gateway, Lambda, service), from its runbook context.
 *
 * @param runbook - The executed runbook
 * @param result - Its execution result
 * @returns The context of the family, or `undefined` for a runbook of no family
 *
 * @example
 * ```typescript
 * const context = buildFamilyOutputContext(runbook, result) ?? emptyRunbookOutputContext();
 * ```
 */
export function buildFamilyOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
): RunbookOutputContext | undefined {
  return (
    buildApiGwOutputContext(runbook, result) ??
    buildLambdaOutputContext(runbook, result) ??
    buildServiceOutputContext(runbook, result)
  );
}
