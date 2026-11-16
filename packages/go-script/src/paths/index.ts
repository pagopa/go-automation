/**
 * Paths Module Export
 *
 * Script-level path resolution (data/, inputs/, outputs/, configs/). Depends on the
 * execution environment: it belongs with the script framework, not with the kernel.
 */

export { GOPaths } from './GOPaths.js';
export type { GOPathResolutionResult, GOConfigPathResult, GOPathsOptions } from './GOPaths.js';
export { GOPathEnvironmentVariables } from './GOPathEnvironmentVariables.js';
export type { GOPathEnvVarKey, GOPathEnvVarValue } from './GOPathEnvironmentVariables.js';
