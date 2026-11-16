import type { ServiceRegistry } from '../services/ServiceRegistry.js';

/**
 * Stub services accepted by {@link createTestServiceRegistry}.
 *
 * Service **names** are checked against {@link ServiceRegistry}; their shapes are
 * not, because a test stubs only the handful of methods its subject calls.
 */
export type TestServiceOverrides = {
  readonly [K in keyof ServiceRegistry]?: unknown;
};
