import { RunbookKinds, type RunbookKind } from './RunbookKind.js';

const KINDS: ReadonlySet<unknown> = new Set(Object.values(RunbookKinds));

/**
 * Type guard for {@link RunbookKind}.
 *
 * @param value - Any value
 * @returns Whether it is a known runbook family
 */
export function isRunbookKind(value: unknown): value is RunbookKind {
  return KINDS.has(value);
}
