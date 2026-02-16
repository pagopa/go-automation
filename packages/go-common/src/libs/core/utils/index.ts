/**
 * Utils Export
 */

export { GOPaths, GOPathType } from './GOPaths.js';
export type { GOPathTypeValue, GOPathResolutionResult, GOConfigPathResult, GOPathsOptions } from './GOPaths.js';
export { GOPathEnvironmentVariables } from './GOPathEnvironmentVariables.js';
export type { GOPathEnvVarKey, GOPathEnvVarValue } from './GOPathEnvironmentVariables.js';
export { smartTruncate, truncatePath, truncateText, isPath, type GOSmartTruncateOptions } from './GOStringUtils.js';
export {
  formatConfigSourceDisplay,
  formatConfigValueDisplay,
  formatConfigDisplay,
  type FormattedConfigDisplay,
} from './GOConfigDisplayFormatter.js';
export { valueToString, safeJsonStringify, type GOValueToStringOptions } from './GOValueToString.js';
export {
  isNullish,
  isPrimitive,
  isError,
  isNodeError,
  isPlainObject,
  isObject,
  isArray,
  isString,
  isNumber,
  isBoolean,
  isFunction,
  isDate,
  isValidDate,
  isBuffer,
  isMap,
  isSet,
  isRegExp,
  isSymbol,
  isBigInt,
  isPromise,
  isNonEmptyString,
  isNonEmptyArray,
  hasProperty,
  hasMessage,
} from './GOTypeGuards.js';
export {
  pollUntilComplete,
  exponentialBackoff,
  fixedBackoff,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_CAP_MS,
} from './pollUntilComplete.js';
export type { PollOptions, PollAttemptInfo, BackoffFn } from './pollUntilComplete.js';
