import type { Runbook } from '../../engine/types/Runbook.js';
import { TEST_RUNBOOK_METADATA } from './TEST_RUNBOOK_METADATA.js';

/**
 * Builds the smallest valid runbook: no steps, no known errors and a `log` fallback.
 *
 * @param overrides - Fields replacing the defaults (steps, known errors, metadata, ...)
 * @returns The runbook, with id `test-runbook` unless overridden
 *
 * @example
 * ```typescript
 * const runbook = createTestRunbook({ steps: [{ step }], knownErrors: [knownError] });
 * ```
 */
export function createTestRunbook(overrides: Partial<Runbook> = {}): Runbook {
  return {
    metadata: { id: 'test-runbook', ...TEST_RUNBOOK_METADATA },
    steps: [],
    knownErrors: [],
    fallbackAction: { type: 'log', level: 'warn', title: 'fallback' },
    ...overrides,
  };
}
