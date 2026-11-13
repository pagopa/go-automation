/**
 * Validation helpers for untrusted configuration values (parsed JSON/YAML of
 * mapping profiles and environments files). Shared by the parsers so they
 * agree on what an object, a string or a list is.
 *
 * Every helper throws an `Error` whose message starts with `where`, the path
 * of the offending value (e.g. `profile.json.transforms.subject[0].value`).
 * Strings are always trimmed, and a blank string is as invalid as a missing one.
 */

import { isNonBlankString, isPlainObject } from '@pagopa/go-common/utils';

/**
 * Checks that a value is a plain object (not an array, not `null`).
 *
 * @param value - Untrusted value
 * @param where - Path of the value, for the error message
 * @returns The value as a record
 * @throws Error when the value is not a plain object
 */
export function asRecord(value: unknown, where: string): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) throw new Error(`${where}: must be an object`);
  return value;
}

/**
 * Rejects keys outside an allowed set: they are usually typos.
 *
 * @param record - Validated object
 * @param allowed - Allowed keys
 * @param where - Path of the object, for the error message
 * @throws Error naming the first unknown key
 */
export function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  where: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${where}: unknown key "${key}"`);
  }
}

/**
 * Checks that a value is a non-blank string.
 *
 * @param value - Untrusted value
 * @param where - Path of the value, for the error message
 * @returns The trimmed string
 * @throws Error when the value is not a string or is blank
 */
export function requiredString(value: unknown, where: string): string {
  if (!isNonBlankString(value)) throw new Error(`${where}: must be a non-empty string`);
  return value.trim();
}

/**
 * Like {@link requiredString}, but `undefined` is accepted.
 *
 * @param value - Untrusted value
 * @param where - Path of the value, for the error message
 * @returns The trimmed string, or `undefined` when absent
 * @throws Error when the value is present but not a non-blank string
 */
export function optionalString(value: unknown, where: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, where);
}

/**
 * Checks that a value is an array of non-blank strings.
 *
 * @param value - Untrusted value
 * @param where - Path of the value, for the error message
 * @returns The trimmed items
 * @throws Error when the value is not an array or an item is not a non-blank string
 */
export function stringList(value: unknown, where: string): ReadonlyArray<string> {
  if (!Array.isArray(value)) throw new Error(`${where}: must be an array of strings`);
  const items: ReadonlyArray<unknown> = value;
  return items.map((item, index) => requiredString(item, `${where}[${index}]`));
}

/**
 * Checks that a value is an object whose values are strings. Values are
 * trimmed; an empty value is allowed (it clears the field it is mapped to).
 *
 * @param value - Untrusted value
 * @param where - Path of the value, for the error message
 * @returns A new record with the trimmed values
 * @throws Error when the value is not an object or a value is not a string
 */
export function stringRecord(value: unknown, where: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(asRecord(value, where)).map(([key, item]): readonly [string, string] => {
      if (typeof item !== 'string') throw new Error(`${where}.${key}: must be a string`);
      return [key, item.trim()];
    }),
  );
}
