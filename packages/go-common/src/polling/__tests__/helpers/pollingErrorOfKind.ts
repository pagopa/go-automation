import { GOPollingError } from '../../GOPollingError.js';
import type { GOPollingErrorKind } from '../../GOPollingErrorKind.js';

/** Validator accepted by `assert.rejects`. */
type ErrorPredicate = (error: unknown) => boolean;

/**
 * Builds an `assert.rejects` validator matching a GOPollingError of the given kind.
 *
 * @param kind - Expected GOPollingError kind
 * @returns A predicate for `assert.rejects`
 */
export function pollingErrorOfKind(kind: GOPollingErrorKind): ErrorPredicate {
  return (error: unknown): boolean => error instanceof GOPollingError && error.kind === kind;
}
