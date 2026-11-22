import type { RunbookEvidence } from './RunbookEvidence.js';
import type { RunbookResultField } from './RunbookResultField.js';

/**
 * Generic context included in a runbook result output.
 *
 * `fields` is intended for dashboards and concise operator views,
 * `evidence` carries bounded supporting samples, and `details` can hold
 * a domain-specific typed payload.
 */
export interface RunbookOutputContext {
  readonly fields: ReadonlyArray<RunbookResultField>;
  readonly evidence: ReadonlyArray<RunbookEvidence>;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Output context without fields and evidence.
 *
 * @returns An empty {@link RunbookOutputContext}
 */
export function emptyRunbookOutputContext(): RunbookOutputContext {
  return { fields: [], evidence: [] };
}

/**
 * Widens a typed, domain-specific payload into the generic {@link
 * RunbookOutputContext.details} bag.
 *
 * Centralizes the one unavoidable cast: a typed interface has no implicit index
 * signature, so it is not directly assignable to `Record<string, unknown>`.
 *
 * @param value - The domain-specific output context (e.g. service/apigw/lambda)
 * @returns The same object typed as the generic details record
 */
export function toRunbookOutputDetails<T extends object>(value: T): Readonly<Record<string, unknown>> {
  return value as unknown as Readonly<Record<string, unknown>>;
}
