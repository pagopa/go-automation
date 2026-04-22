/**
 * GO Error Utilities
 *
 * Centralized error handling utilities for TypeScript strict mode.
 * Provides type-safe functions for working with unknown errors in catch blocks.
 *
 * @example
 * ```typescript
 * import { getErrorMessage, toError, isError } from '@go-automation/go-common';
 *
 * try {
 *   await riskyOperation();
 * } catch (error: unknown) {
 *   // Extract message safely
 *   const message = getErrorMessage(error);
 *
 *   // Convert to Error instance
 *   const errorInstance = toError(error);
 *
 *   // Type guard check
 *   if (isError(error)) {
 *     console.log(error.stack);
 *   }
 * }
 * ```
 */

import { isError, hasMessage } from '../utils/GOTypeGuards.js';

type ErrorStringifier = () => string;

interface ErrorWithToString {
  toString: ErrorStringifier;
}

/**
 * Extracts the error message from an unknown error type.
 * Handles Error instances, strings, and other values safely.
 *
 * @param error - The caught error of unknown type
 * @returns The error message string
 *
 * @example
 * ```typescript
 * try {
 *   JSON.parse(invalidJson);
 * } catch (error: unknown) {
 *   const message = getErrorMessage(error);
 *   logger.error(`Parse failed: ${message}`);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error === null) {
    return 'null';
  }

  if (error === undefined) {
    return 'undefined';
  }

  // For objects with a message property
  if (hasMessage(error)) {
    const message = error.message;
    if (typeof message === 'string') {
      return message;
    }
  }

  // For objects with a custom toString method
  if (typeof error === 'object' && error !== null && 'toString' in error) {
    const toStringResult = (error as ErrorWithToString).toString();
    // Check if it's not the default [object Object]
    if (!toStringResult.startsWith('[object ')) {
      return toStringResult;
    }
  }

  // Fallback: try to JSON serialize or use a generic message
  try {
    return JSON.stringify(error);
  } catch {
    return '[Unknown error]';
  }
}

/**
 * Converts an unknown error to an Error instance.
 * Preserves the original Error if already an instance,
 * otherwise creates a new Error with the extracted message.
 *
 * @param error - The caught error of unknown type
 * @returns An Error instance
 *
 * @example
 * ```typescript
 * try {
 *   await asyncOperation();
 * } catch (error: unknown) {
 *   const errorInstance = toError(error);
 *   // Now you have a proper Error with message and stack
 *   throw errorInstance;
 * }
 * ```
 */
export function toError(error: unknown): Error {
  if (isError(error)) {
    return error;
  }

  return new Error(getErrorMessage(error));
}

/**
 * Wraps an error with additional context message.
 * Useful for adding context when re-throwing errors.
 *
 * @param error - The original error of unknown type
 * @param context - Additional context to prepend to the message
 * @returns A new Error with combined message
 *
 * @example
 * ```typescript
 * try {
 *   await loadConfig(path);
 * } catch (error: unknown) {
 *   throw wrapError(error, `Failed to load config from ${path}`);
 * }
 * // Results in: "Failed to load config from /path: Original error message"
 * ```
 */
export function wrapError(error: unknown, context: string): Error {
  const originalMessage = getErrorMessage(error);
  const wrappedError = new Error(`${context}: ${originalMessage}`);

  // Preserve the original stack if available
  if (isError(error) && error.stack !== undefined) {
    wrappedError.stack = `${wrappedError.message}\n    [Caused by]\n${error.stack}`;
  }

  return wrappedError;
}

/**
 * Gets the error stack trace if available, otherwise returns the message.
 * Useful for logging detailed error information.
 *
 * @param error - The caught error of unknown type
 * @returns The stack trace or message string
 *
 * @example
 * ```typescript
 * try {
 *   await operation();
 * } catch (error: unknown) {
 *   logger.debug(getErrorStack(error));
 * }
 * ```
 */
export function getErrorStack(error: unknown): string {
  if (isError(error) && error.stack !== undefined) {
    return error.stack;
  }

  return getErrorMessage(error);
}

/**
 * Checks if an error has a specific name (e.g., 'AbortError', 'TypeError').
 * Useful for handling specific error types.
 *
 * @param error - The caught error of unknown type
 * @param name - The error name to check for
 * @returns True if the error has the specified name
 *
 * @example
 * ```typescript
 * try {
 *   await fetch(url, { signal: controller.signal });
 * } catch (error: unknown) {
 *   if (hasErrorName(error, 'AbortError')) {
 *     console.log('Request was cancelled');
 *   }
 * }
 * ```
 */
export function hasErrorName(error: unknown, name: string): boolean {
  return isError(error) && error.name === name;
}

/**
 * Checks if an error message contains a specific substring (case-insensitive).
 * Useful for matching error patterns.
 *
 * @param error - The caught error of unknown type
 * @param substring - The substring to search for
 * @returns True if the error message contains the substring
 *
 * @example
 * ```typescript
 * try {
 *   await connectToDatabase();
 * } catch (error: unknown) {
 *   if (errorMessageContains(error, 'ECONNREFUSED')) {
 *     console.log('Database connection refused');
 *   }
 * }
 * ```
 */
export function errorMessageContains(error: unknown, substring: string): boolean {
  const message = getErrorMessage(error);
  return message.toLowerCase().includes(substring.toLowerCase());
}
