import type { LambdaFunction } from '../types/LambdaFunction.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';

/**
 * Structured context attached to a Lambda runbook, used for polymorphic
 * output/summary dispatch. Mirrors `apigw.ApiGwRunbookContext`.
 */
export interface LambdaRunbookContext {
  readonly kind: 'lambda';
  readonly lambda: LambdaFunction;
  readonly downstreams: ReadonlyArray<LambdaDownstream>;
  readonly queryProfileId: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Type guard recognising a {@link LambdaRunbookContext}. Used by
 * `buildLambdaOutputContext` and the analyzer's polymorphic dispatch.
 *
 * @param value - The runbook `runbookContext` value
 * @returns `true` when the value is a Lambda runbook context
 */
export function isLambdaRunbookContext(value: unknown): value is LambdaRunbookContext {
  if (!isRecord(value)) return false;
  if (value['kind'] !== 'lambda') return false;
  if (!isNonEmptyString(value['queryProfileId'])) return false;
  const lambda = value['lambda'];
  if (!isRecord(lambda) || !isNonEmptyString(lambda['name']) || !isNonEmptyString(lambda['logGroup'])) return false;
  return Array.isArray(value['downstreams']);
}
