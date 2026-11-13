import type { InteropEnvironment } from './InteropEnvironment.js';
import { INTEROP_ENVIRONMENTS } from './INTEROP_ENVIRONMENTS.js';

/**
 * Whether a value is an INTEROP environment.
 *
 * @param value - Candidate value
 * @returns `true` for `prod`, `att` and `test`
 */
export function isInteropEnvironment(value: unknown): value is InteropEnvironment {
  return typeof value === 'string' && INTEROP_ENVIRONMENTS.includes(value as InteropEnvironment);
}
