/**
 * INTEROP environments supported by the k8s alarm resolvers.
 */
export type InteropEnvironment = 'prod' | 'att' | 'test';

export const INTEROP_ENVIRONMENTS: readonly [InteropEnvironment, ...InteropEnvironment[]] = ['prod', 'att', 'test'];

/**
 * Type guard for {@link InteropEnvironment} values.
 *
 * @param value - Candidate value, typically a regex named-group capture
 * @returns True when the value is one of the supported INTEROP environments
 */
export function isInteropEnvironment(value: unknown): value is InteropEnvironment {
  return typeof value === 'string' && INTEROP_ENVIRONMENTS.includes(value as InteropEnvironment);
}
