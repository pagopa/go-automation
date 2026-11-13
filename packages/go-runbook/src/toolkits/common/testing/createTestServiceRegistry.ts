import { NOOP_RUNBOOK_REPORTER } from '../../../engine/reporting/NOOP_RUNBOOK_REPORTER.js';
import { OPERATIONAL_SERVICE_METHODS } from '../services/OPERATIONAL_SERVICE_CAPABILITIES.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';
import type { TestServiceCall } from './TestServiceCall.js';
import type { TestServiceOverrides } from './TestServiceOverrides.js';
import { UnexpectedServiceCallError } from './UnexpectedServiceCallError.js';

/** Methods that derive a scoped service: the fake returns itself and records the arguments. */
const SCOPING_METHODS: ReadonlySet<string> = new Set(['forTarget', 'forExecution']);

/** Calls recorded by each fake service, keyed by the fake (never by the stub a test passed). */
const RECORDED_CALLS = new WeakMap<object, TestServiceCall[]>();

/**
 * Builds a {@link ServiceRegistry} for tests, **complete by construction**
 * (EVO-RBREORG-OPUS-01 RBREORG-18).
 *
 * Every operational service is present and exposes every method of
 * {@link OPERATIONAL_SERVICE_METHODS}, so the service check of the engine
 * accepts the registry. A test stubs only the methods its subject calls; the
 * stubs are merged **method by method** with a fake whose other methods throw
 * {@link UnexpectedServiceCallError} naming the method. `forTarget` and
 * `forExecution`, when not stubbed, return the same fake and record their
 * arguments (see {@link recordedServiceCalls}). A stub that already exposes
 * every method is returned as is.
 *
 * An override explicitly set to `undefined` counts as **not provided**, the same
 * way the `exactOptionalPropertyTypes` spread idiom treats it everywhere else in
 * this codebase.
 *
 * @param overrides - Stub services the test wants to provide
 * @returns A registry usable wherever a real one is expected
 *
 * @example
 * ```typescript
 * const services = createTestServiceRegistry({ cloudWatchLogs: { query } });
 * ```
 */
export function createTestServiceRegistry(overrides: TestServiceOverrides = {}): ServiceRegistry {
  const provided = overrides as Readonly<Record<string, unknown>>;
  const services: Record<string, unknown> = { reporter: overrides.reporter ?? NOOP_RUNBOOK_REPORTER };
  for (const [name, methods] of Object.entries(OPERATIONAL_SERVICE_METHODS)) {
    services[name] = completeService(name, methods, provided[name]);
  }
  // Safe: every operational service exposes the methods its port declares (OPERATIONAL_SERVICE_METHODS).
  return services as unknown as ServiceRegistry;
}

/**
 * Calls recorded by a fake service of {@link createTestServiceRegistry} for the
 * methods it derived on its own (`forTarget`, `forExecution`).
 *
 * @param service - A service of a test registry
 * @returns The recorded calls, oldest first
 */
export function recordedServiceCalls(service: unknown): ReadonlyArray<TestServiceCall> {
  return typeof service === 'object' && service !== null ? (RECORDED_CALLS.get(service) ?? []) : [];
}

function completeService(name: string, methods: ReadonlyArray<string>, stub: unknown): unknown {
  if (stub !== undefined && (typeof stub !== 'object' || stub === null)) return stub;
  const base = (stub ?? {}) as Readonly<Record<string, unknown>>;
  const missing = methods.filter((method) => typeof base[method] !== 'function');
  if (stub !== undefined && missing.length === 0) return stub;
  const fake = Object.create(base) as Record<string, unknown>;
  const calls: TestServiceCall[] = [];
  RECORDED_CALLS.set(fake, calls);
  for (const method of missing) {
    const derived = deriveFromStub(name, method, base);
    if (derived !== undefined) {
      fake[method] = derived;
      continue;
    }
    fake[method] = SCOPING_METHODS.has(method)
      ? (...args: ReadonlyArray<unknown>): unknown => {
          calls.push({ method, args });
          return fake;
        }
      : (): never => {
          throw new UnexpectedServiceCallError(`${name}.${method}`);
        };
  }
  return fake;
}

/** Statistics of a query answered by a stub that does not report them. */
const EMPTY_QUERY_STATISTICS = { bytesScanned: 0, recordsScanned: 0, recordsMatched: 0 };

type StubMethodFn = (...args: ReadonlyArray<unknown>) => unknown;

/**
 * A CloudWatch Logs stub implements `query` or `queryWithStatistics`, the two
 * views of the same read: the missing one is derived from the other, as the real
 * service does, instead of throwing.
 */
function deriveFromStub(
  name: string,
  method: string,
  stub: Readonly<Record<string, unknown>>,
): StubMethodFn | undefined {
  if (name !== 'cloudWatchLogs') return undefined;
  const query = stub['query'];
  const queryWithStatistics = stub['queryWithStatistics'];
  if (method === 'queryWithStatistics' && typeof query === 'function') {
    return async (...args) => ({
      rows: await (query as StubMethodFn).apply(stub, [...args]),
      statistics: EMPTY_QUERY_STATISTICS,
      queryExecutions: [],
    });
  }
  if (method === 'query' && typeof queryWithStatistics === 'function') {
    return async (...args) =>
      ((await (queryWithStatistics as StubMethodFn).apply(stub, [...args])) as { rows: unknown }).rows;
  }
  return undefined;
}
