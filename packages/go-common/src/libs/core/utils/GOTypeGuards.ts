/**
 * GOTypeGuards - Centralized type guard utilities
 *
 * Provides type-safe runtime type checking functions for use throughout the codebase.
 * All functions are pure, have no side effects, and return boolean type predicates.
 */

/**
 * Checks if a value is null or undefined.
 *
 * @param value - Value to check
 * @returns true if value is null or undefined
 *
 * @example
 * ```typescript
 * isNullish(null);      // true
 * isNullish(undefined); // true
 * isNullish(0);         // false
 * isNullish('');        // false
 * ```
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Checks if a value is a primitive type (string, number, boolean, bigint, null, undefined).
 *
 * @param value - Value to check
 * @returns true if value is a primitive type
 *
 * @example
 * ```typescript
 * isPrimitive('hello');     // true
 * isPrimitive(42);          // true
 * isPrimitive(true);        // true
 * isPrimitive(123n);        // true
 * isPrimitive(null);        // true
 * isPrimitive(undefined);   // true
 * isPrimitive({});          // false
 * isPrimitive([]);          // false
 * ```
 */
export function isPrimitive(
  value: unknown,
): value is string | number | boolean | bigint | null | undefined {
  if (value === null || value === undefined) {
    return true;
  }
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint';
}

/**
 * Checks if a value is an Error instance.
 *
 * @param value - Value to check
 * @returns true if value is an Error
 *
 * @example
 * ```typescript
 * isError(new Error('test'));      // true
 * isError(new TypeError('test'));  // true
 * isError({ message: 'test' });    // false
 * isError('error string');         // false
 * ```
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard for Node.js errors with code property.
 *
 * @param error - Value to check
 * @returns  returns true if value is a NodeJS.ErrnoException
 *
 * @example
 * ```typescript
 * isNodeError(someError); // true if someError is a NodeJS.ErrnoException
 * ```
 */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Checks if a value is a plain object (not null, not array, not Date, etc.).
 *
 * @param value - Value to check
 * @returns true if value is a plain object
 *
 * @example
 * ```typescript
 * isPlainObject({});              // true
 * isPlainObject({ a: 1 });        // true
 * isPlainObject([]);              // false
 * isPlainObject(null);            // false
 * isPlainObject(new Date());      // false
 * ```
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks if a value is an object (including arrays, dates, etc., but not null).
 *
 * @param value - Value to check
 * @returns true if value is an object
 *
 * @example
 * ```typescript
 * isObject({});           // true
 * isObject([]);           // true
 * isObject(new Date());   // true
 * isObject(null);         // false
 * isObject('string');     // false
 * ```
 */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks if a value is an array.
 *
 * @param value - Value to check
 * @returns true if value is an array
 *
 * @example
 * ```typescript
 * isArray([]);            // true
 * isArray([1, 2, 3]);     // true
 * isArray({});            // false
 * isArray('string');      // false
 * ```
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Checks if a value is a string.
 *
 * @param value - Value to check
 * @returns true if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Checks if a value is a number (excluding NaN).
 *
 * @param value - Value to check
 * @returns true if value is a finite number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Checks if a value is a boolean.
 *
 * @param value - Value to check
 * @returns true if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Checks if a value is a function.
 *
 * @param value - Value to check
 * @returns true if value is a function
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Checks if a value is a Date instance.
 *
 * @param value - Value to check
 * @returns true if value is a Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/**
 * Checks if a value is a valid Date (not Invalid Date).
 *
 * @param value - Value to check
 * @returns true if value is a valid Date
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Checks if a value is a Buffer.
 *
 * @param value - Value to check
 * @returns true if value is a Buffer
 */
export function isBuffer(value: unknown): value is Buffer {
  return Buffer.isBuffer(value);
}

/**
 * Checks if a value is a Map.
 *
 * @param value - Value to check
 * @returns true if value is a Map
 */
export function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

/**
 * Checks if a value is a Set.
 *
 * @param value - Value to check
 * @returns true if value is a Set
 */
export function isSet(value: unknown): value is Set<unknown> {
  return value instanceof Set;
}

/**
 * Checks if a value is a RegExp.
 *
 * @param value - Value to check
 * @returns true if value is a RegExp
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

/**
 * Checks if a value is a Symbol.
 *
 * @param value - Value to check
 * @returns true if value is a Symbol
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

/**
 * Checks if a value is a BigInt.
 *
 * @param value - Value to check
 * @returns true if value is a BigInt
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

/**
 * Checks if a value is a Promise.
 *
 * @param value - Value to check
 * @returns true if value is a Promise
 */
export function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

/**
 * Checks if a value is a non-empty string.
 *
 * @param value - Value to check
 * @returns true if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Checks if a value is a non-empty array.
 *
 * @param value - Value to check
 * @returns true if value is a non-empty array
 */
export function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if an object has a specific property.
 *
 * @param obj - Object to check
 * @param key - Property key to look for
 * @returns true if object has the property
 */
export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

/**
 * Checks if a value has a 'message' property (duck-typing for error-like objects).
 *
 * @param value - Value to check
 * @returns true if value has a message property
 */
export function hasMessage(value: unknown): value is { message: unknown } {
  return isObject(value) && 'message' in value;
}
