/**
 * GO Result Type
 *
 * A Result type inspired by Rust's Result<T, E> for type-safe error handling.
 * Provides an alternative to throwing exceptions, making error handling explicit.
 *
 * Note: This file imports from GOErrorUtils.ts. To avoid circular dependencies,
 * GOErrorUtils.ts should not import from this file.
 *
 * @example
 * ```typescript
 * import { ok, err, isOk, isErr, unwrapOr } from '@go-automation/go-common';
 *
 * function parseNumber(input: string): GOResult<number, string> {
 *   const num = Number(input);
 *   if (Number.isNaN(num)) {
 *     return err(`Invalid number: ${input}`);
 *   }
 *   return ok(num);
 * }
 *
 * const result = parseNumber('42');
 * if (isOk(result)) {
 *   console.log(`Parsed: ${result.value}`);
 * } else {
 *   console.log(`Error: ${result.error}`);
 * }
 *
 * // Or use unwrapOr for a default value
 * const value = unwrapOr(result, 0);
 * ```
 */

import { toError } from './GOErrorUtils.js';

/**
 * Represents a successful result containing a value.
 *
 * @template T - The type of the success value
 */
export interface GOResultOk<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Represents a failed result containing an error.
 *
 * @template E - The type of the error value
 */
export interface GOResultErr<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A discriminated union representing either success (Ok) or failure (Err).
 * Similar to Rust's Result<T, E> type.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value (defaults to Error)
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): GOResult<number, string> {
 *   if (b === 0) {
 *     return err('Division by zero');
 *   }
 *   return ok(a / b);
 * }
 * ```
 */
export type GOResult<T, E = Error> = GOResultOk<T> | GOResultErr<E>;

/**
 * Creates a successful Result containing the given value.
 *
 * @template T - The type of the value
 * @param value - The success value
 * @returns A GOResultOk containing the value
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * // result.ok === true
 * // result.value === 42
 * ```
 */
export function ok<T>(value: T): GOResultOk<T> {
  return { ok: true, value };
}

/**
 * Creates a failed Result containing the given error.
 *
 * @template E - The type of the error
 * @param error - The error value
 * @returns A GOResultErr containing the error
 *
 * @example
 * ```typescript
 * const result = err(new Error('Something went wrong'));
 * // result.ok === false
 * // result.error.message === 'Something went wrong'
 * ```
 */
export function err<E>(error: E): GOResultErr<E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is Ok (successful).
 *
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param result - The Result to check
 * @returns True if the Result is Ok
 *
 * @example
 * ```typescript
 * const result = parseNumber('42');
 * if (isOk(result)) {
 *   // TypeScript knows result.value exists here
 *   console.log(result.value);
 * }
 * ```
 */
export function isOk<T, E>(result: GOResult<T, E>): result is GOResultOk<T> {
  return result.ok;
}

/**
 * Type guard to check if a Result is Err (failed).
 *
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param result - The Result to check
 * @returns True if the Result is Err
 *
 * @example
 * ```typescript
 * const result = parseNumber('invalid');
 * if (isErr(result)) {
 *   // TypeScript knows result.error exists here
 *   console.log(result.error);
 * }
 * ```
 */
export function isErr<T, E>(result: GOResult<T, E>): result is GOResultErr<E> {
  return !result.ok;
}

/**
 * Extracts the value from an Ok Result, or throws the error from an Err Result.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param result - The Result to unwrap
 * @returns The success value
 * @throws The error if the Result is Err
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * const value = unwrap(result); // 42
 *
 * const errResult = err(new Error('Failed'));
 * unwrap(errResult); // throws Error('Failed')
 * ```
 */
export function unwrap<T, E>(result: GOResult<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }

  throw toError(result.error);
}

/**
 * Extracts the value from an Ok Result, or returns a default value for Err.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param result - The Result to unwrap
 * @param defaultValue - The default value to return if Err
 * @returns The success value or the default value
 *
 * @example
 * ```typescript
 * const okResult = ok(42);
 * unwrapOr(okResult, 0); // 42
 *
 * const errResult = err('Failed');
 * unwrapOr(errResult, 0); // 0
 * ```
 */
export function unwrapOr<T, E>(result: GOResult<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Extracts the value from an Ok Result, or computes a default using a function.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param result - The Result to unwrap
 * @param fn - A function that receives the error and returns a default value
 * @returns The success value or the computed default
 *
 * @example
 * ```typescript
 * const result = err('Not found');
 * const value = unwrapOrElse(result, (error) => {
 *   console.log(`Using default because: ${error}`);
 *   return 0;
 * });
 * ```
 */
export function unwrapOrElse<T, E>(result: GOResult<T, E>, fn: (error: E) => T): T {
  if (isOk(result)) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Maps an Ok Result's value using a function, passing through Err unchanged.
 *
 * @template T - The type of the original success value
 * @template U - The type of the mapped success value
 * @template E - The type of the error value
 * @param result - The Result to map
 * @param fn - The mapping function
 * @returns A new Result with the mapped value
 *
 * @example
 * ```typescript
 * const result = ok(5);
 * const doubled = map(result, (n) => n * 2); // ok(10)
 *
 * const errResult = err('Failed');
 * const mapped = map(errResult, (n) => n * 2); // err('Failed')
 * ```
 */
export function map<T, U, E>(result: GOResult<T, E>, fn: (value: T) => U): GOResult<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Maps an Err Result's error using a function, passing through Ok unchanged.
 *
 * @template T - The type of the success value
 * @template E - The type of the original error value
 * @template F - The type of the mapped error value
 * @param result - The Result to map
 * @param fn - The error mapping function
 * @returns A new Result with the mapped error
 *
 * @example
 * ```typescript
 * const result = err('Not found');
 * const mapped = mapErr(result, (e) => new Error(e));
 * // mapped.error instanceof Error
 * ```
 */
export function mapErr<T, E, F>(result: GOResult<T, E>, fn: (error: E) => F): GOResult<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chains Result operations, flattening nested Results.
 * Similar to flatMap or andThen in other languages.
 *
 * @template T - The type of the original success value
 * @template U - The type of the new success value
 * @template E - The type of the error value
 * @param result - The Result to chain from
 * @param fn - A function that returns a new Result
 * @returns The chained Result
 *
 * @example
 * ```typescript
 * function parseInt(s: string): GOResult<number, string> {
 *   const n = Number(s);
 *   return Number.isNaN(n) ? err('Invalid number') : ok(n);
 * }
 *
 * function positive(n: number): GOResult<number, string> {
 *   return n > 0 ? ok(n) : err('Must be positive');
 * }
 *
 * const result = andThen(parseInt('42'), positive);
 * // ok(42)
 *
 * const result2 = andThen(parseInt('-5'), positive);
 * // err('Must be positive')
 * ```
 */
export function andThen<T, U, E>(
  result: GOResult<T, E>,
  fn: (value: T) => GOResult<U, E>,
): GOResult<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Converts a Promise that might throw to a Promise of Result.
 * Useful for wrapping async operations in Result-based error handling.
 *
 * @template T - The type of the success value
 * @param promise - The Promise to convert
 * @returns A Promise that always resolves to a Result
 *
 * @example
 * ```typescript
 * const result = await fromPromise(fetch(url));
 * if (isOk(result)) {
 *   console.log('Response:', result.value);
 * } else {
 *   console.log('Failed:', result.error.message);
 * }
 * ```
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<GOResult<T, Error>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Executes a function and returns a Result instead of throwing.
 * Useful for wrapping synchronous operations that might throw.
 *
 * @template T - The type of the success value
 * @param fn - The function to execute
 * @returns A Result containing the return value or caught error
 *
 * @example
 * ```typescript
 * const result = tryCatch(() => JSON.parse(jsonString));
 * if (isOk(result)) {
 *   console.log('Parsed:', result.value);
 * } else {
 *   console.log('Parse error:', result.error.message);
 * }
 * ```
 */
export function tryCatch<T>(fn: () => T): GOResult<T, Error> {
  try {
    return ok(fn());
  } catch (error) {
    return err(toError(error));
  }
}
