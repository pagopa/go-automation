/**
 * GO Error Base Class
 *
 * A base error class with additional metadata for better error handling.
 * Extends the standard Error with code, context, and cause properties.
 *
 * @example
 * ```typescript
 * import { GOError } from '@go-automation/go-common';
 *
 * // Create a custom error with code
 * throw new GOError('User not found', {
 *   code: 'USER_NOT_FOUND',
 *   context: { userId: '123' },
 * });
 *
 * // Wrap an existing error
 * try {
 *   await fetchData();
 * } catch (error) {
 *   throw new GOError('Failed to fetch data', {
 *     code: 'FETCH_ERROR',
 *     cause: error,
 *   });
 * }
 * ```
 */

/**
 * Options for creating a GOError instance.
 */
export interface GOErrorOptions {
  /**
   * A machine-readable error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND').
   */
  readonly code?: string;

  /**
   * Additional context data related to the error.
   */
  readonly context?: Readonly<Record<string, unknown>>;

  /**
   * The underlying cause of this error (for error chaining).
   */
  readonly cause?: unknown;
}

/**
 * Base error class for GO automation scripts.
 * Provides additional metadata beyond the standard Error class.
 *
 * Features:
 * - Error code for programmatic handling
 * - Context data for debugging
 * - Error chaining with cause
 * - Proper prototype chain for instanceof checks
 *
 * @example
 * ```typescript
 * // Simple error
 * const error = new GOError('Something went wrong');
 *
 * // Error with code
 * const error = new GOError('Invalid input', { code: 'INVALID_INPUT' });
 *
 * // Error with context
 * const error = new GOError('File not found', {
 *   code: 'FILE_NOT_FOUND',
 *   context: { path: '/path/to/file', attempted: true },
 * });
 *
 * // Error wrapping another error
 * const error = new GOError('Operation failed', {
 *   code: 'OPERATION_ERROR',
 *   cause: originalError,
 * });
 * ```
 */
export class GOError extends Error {
  /**
   * A machine-readable error code.
   */
  readonly code: string | undefined;

  /**
   * Additional context data for debugging.
   */
  readonly context: Readonly<Record<string, unknown>> | undefined;

  /**
   * The underlying cause of this error.
   */
  override readonly cause: unknown;

  constructor(message: string, options?: GOErrorOptions) {
    super(message);

    // Maintain proper prototype chain (required for instanceof to work)
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = 'GOError';
    this.code = options?.code;
    this.context = options?.context;
    this.cause = options?.cause;

    // Capture stack trace (V8 only)
    if (Error.captureStackTrace !== undefined) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Creates a string representation of the error including metadata.
   *
   * @returns A formatted error string
   */
  override toString(): string {
    const parts: string[] = [this.name];

    if (this.code !== undefined) {
      parts.push(`[${this.code}]`);
    }

    parts.push(`: ${this.message}`);

    return parts.join('');
  }

  /**
   * Converts the error to a plain object for logging or serialization.
   *
   * @returns A plain object representation of the error
   */
  toObject(): Readonly<{
    name: string;
    message: string;
    code: string | undefined;
    context: Readonly<Record<string, unknown>> | undefined;
    stack: string | undefined;
    cause: unknown;
  }> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
      cause: this.cause,
    };
  }

  /**
   * Converts the error to JSON format.
   * Useful for logging or API error responses.
   *
   * @returns A JSON-serializable object
   */
  toJSON(): Readonly<{
    name: string;
    message: string;
    code: string | undefined;
    context: Readonly<Record<string, unknown>> | undefined;
  }> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    };
  }

  /**
   * Type guard to check if a value is a GOError instance.
   *
   * @param value - The value to check
   * @returns True if the value is a GOError
   *
   * @example
   * ```typescript
   * try {
   *   await operation();
   * } catch (error) {
   *   if (GOError.isGOError(error)) {
   *     console.log(`Error code: ${error.code}`);
   *   }
   * }
   * ```
   */
  static isGOError(value: unknown): value is GOError {
    return value instanceof GOError;
  }

  /**
   * Creates a GOError from an unknown error value.
   * Preserves the original error as the cause.
   *
   * @param error - The error to convert
   * @param code - Optional error code to assign
   * @returns A GOError instance
   *
   * @example
   * ```typescript
   * try {
   *   await riskyOperation();
   * } catch (error) {
   *   throw GOError.from(error, 'OPERATION_FAILED');
   * }
   * ```
   */
  static from(error: unknown, code?: string): GOError {
    if (GOError.isGOError(error)) {
      // If already a GOError with the same code, return as is
      if (code === undefined || error.code === code) {
        return error;
      }
      // Otherwise, wrap it with the new code
      // Build options object conditionally to satisfy exactOptionalPropertyTypes
      const options: GOErrorOptions = { cause: error };
      if (code !== undefined) {
        (options as { code: string }).code = code;
      }
      if (error.context !== undefined) {
        (options as { context: Readonly<Record<string, unknown>> }).context = error.context;
      }
      return new GOError(error.message, options);
    }

    if (error instanceof Error) {
      const options: GOErrorOptions = { cause: error };
      if (code !== undefined) {
        (options as { code: string }).code = code;
      }
      return new GOError(error.message, options);
    }

    if (typeof error === 'string') {
      if (code !== undefined) {
        return new GOError(error, { code });
      }
      return new GOError(error);
    }

    const options: GOErrorOptions = { cause: error };
    if (code !== undefined) {
      (options as { code: string }).code = code;
    }
    return new GOError(String(error), options);
  }
}
