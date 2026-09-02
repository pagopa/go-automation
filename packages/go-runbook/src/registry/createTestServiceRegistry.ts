import { omitUndefined } from '@go-automation/go-common/core';

import { NOOP_RUNBOOK_REPORTER } from './reporters/NOOP_RUNBOOK_REPORTER.js';
import type { ServiceRegistry } from './ServiceRegistry.js';

/**
 * Stub services accepted by {@link createTestServiceRegistry}.
 *
 * Service **names** are checked against {@link ServiceRegistry}; their shapes are
 * not, because a test stubs only the handful of methods its subject calls.
 */
export type TestServiceOverrides = {
  readonly [K in keyof ServiceRegistry]?: unknown;
};

/**
 * Builds a {@link ServiceRegistry} for tests, carrying only the collaborators the
 * code under test actually needs.
 *
 * Exists so that the registry is assembled in **one** place: adding a service to
 * the interface means giving it a default here, instead of hunting down every
 * hand-written stub. Touching a service a test did not provide fails that test
 * with a clear `TypeError`.
 *
 * An override explicitly set to `undefined` counts as **not provided**, the same
 * way the `exactOptionalPropertyTypes` spread idiom treats it everywhere else in
 * this codebase. Without that, `{ reporter: undefined }` — easy to produce from a
 * conditionally-built overrides object — would replace the NOOP reporter with
 * `undefined` and fail the test deep inside a step with an unreadable
 * `Cannot read properties of undefined (reading 'section')`.
 *
 * @param overrides - Stub services the test wants to provide
 * @returns A registry usable wherever a real one is expected
 *
 * @example
 * ```typescript
 * const services = createTestServiceRegistry({ cloudWatchLogs });
 * ```
 */
export function createTestServiceRegistry(overrides: TestServiceOverrides = {}): ServiceRegistry {
  // Safe: a test provides the services its subject uses, with the shape that
  // subject needs; the assertion is confined here instead of being repeated at
  // every call site.
  return { reporter: NOOP_RUNBOOK_REPORTER, ...omitUndefined(overrides) } as ServiceRegistry;
}
