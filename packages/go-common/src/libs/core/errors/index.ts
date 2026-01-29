/**
 * GO Error Handling Utilities
 *
 * Centralized error handling for TypeScript strict mode.
 * Provides type-safe utilities for working with unknown errors.
 */

export { GOError } from './GOError.js';
export type { GOErrorOptions } from './GOError.js';
export type { GOResult, GOResultOk, GOResultErr } from './GOResult.js';

export {
  getErrorMessage,
  toError,
  wrapError,
  getErrorStack,
  hasErrorName,
  errorMessageContains,
} from './GOErrorUtils.js';

export {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  andThen,
  fromPromise,
  tryCatch,
} from './GOResult.js';
