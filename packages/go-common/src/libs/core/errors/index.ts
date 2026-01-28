/**
 * GO Error Handling Utilities
 *
 * Centralized error handling for TypeScript strict mode.
 * Provides type-safe utilities for working with unknown errors.
 */

// Error utilities
export {
  isError,
  getErrorMessage,
  toError,
  wrapError,
  getErrorStack,
  hasErrorName,
  errorMessageContains,
} from './GOErrorUtils.js';

// Base error class
export { GOError } from './GOError.js';
export type { GOErrorOptions } from './GOError.js';

// Result type (Rust-style error handling)
export type { GOResult, GOResultOk, GOResultErr } from './GOResult.js';
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
