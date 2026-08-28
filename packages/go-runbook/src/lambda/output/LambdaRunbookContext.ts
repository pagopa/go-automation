import { isNonBlankString, isObject } from '@go-automation/go-common/core';
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

/**
 * Type guard recognising a {@link LambdaRunbookContext}. Used by
 * `buildLambdaOutputContext` and the analyzer's polymorphic dispatch.
 *
 * @param value - The runbook `runbookContext` value
 * @returns `true` when the value is a Lambda runbook context
 */
export function isLambdaRunbookContext(value: unknown): value is LambdaRunbookContext {
  if (!isObject(value)) return false;
  if (value['kind'] !== 'lambda') return false;
  if (!isNonBlankString(value['queryProfileId'])) return false;
  const lambda = value['lambda'];
  if (!isObject(lambda) || !isNonBlankString(lambda['name']) || !isNonBlankString(lambda['logGroup'])) return false;
  return Array.isArray(value['downstreams']);
}
