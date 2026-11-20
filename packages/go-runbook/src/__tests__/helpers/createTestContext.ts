import type { OperationalContext } from '../../toolkits/common/services/OperationalContext.js';
import { createTestServiceRegistry } from '../../toolkits/common/testing/createTestServiceRegistry.js';
import type { TestContextOptions } from './TestContextOptions.js';

/**
 * Builds the context a step or a known-case condition receives, with only what
 * the test sets; also usable where a plain `RunbookContext` is expected.
 *
 * @param options - Params, vars, step outputs, stub services, recovered errors and signal of the context
 * @returns The context, with a fixed execution id and start time and services from `createTestServiceRegistry`
 *
 * @example
 * ```typescript
 * const context = createTestContext({ vars: { status: '500' }, stepResults: { query: rows } });
 * ```
 */
export function createTestContext(options: TestContextOptions = {}): OperationalContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(Object.entries(options.stepResults ?? {})),
    vars: new Map(Object.entries(options.vars ?? {})),
    params: new Map(Object.entries(options.params ?? {})),
    logs: [],
    services: createTestServiceRegistry(options.services),
    // The steps under test are those of alarm analyses, which read partially.
    readPolicy: 'partial',
    recoveredErrors: options.recoveredErrors ?? [],
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}
