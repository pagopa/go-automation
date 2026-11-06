/**
 * Parsing of `--defaults campo=valore` (RF-04).
 */

import { Dispatch } from '@go-automation/go-send';

import { DispatchUsageError } from './DispatchUsageError.js';

/** An item that starts a new entry: `<field name>=`. */
const ENTRY_START = /^[A-Za-z][\w.]*\s*=/;

/**
 * Parses `--defaults` into canonical field values.
 *
 * The GOScript command-line parser splits every value on commas, so
 * `"sender.denomination=Comune di X, Ufficio Y"` arrives as two items. An
 * item that does not start with `<field>=` continues the previous entry and
 * is joined back with `", "` (the parser has already dropped the spaces
 * around the comma). An item that starts with `<field>=` is a new entry, and
 * an unknown field name is an error (typos are not joined silently).
 *
 * @param entries - Items as received from the configuration
 * @returns Field values, in input order
 * @throws DispatchUsageError on unknown fields, missing values, or a first
 *   item that is not `<field>=<value>`
 *
 * @example
 * ```typescript
 * parseDefaults(['sender.denomination=Comune di X', 'Ufficio Y']);
 * // Map { 'sender.denomination' => 'Comune di X, Ufficio Y' }
 * ```
 */
export function parseDefaults(entries: ReadonlyArray<string>): Map<Dispatch.CanonicalField, string> {
  const joined: string[] = [];
  for (const entry of entries) {
    const previous = joined.length - 1;
    if (ENTRY_START.test(entry) || previous < 0) joined.push(entry);
    else joined[previous] = `${joined[previous] ?? ''}, ${entry}`;
  }
  const values = new Map<Dispatch.CanonicalField, string>();
  for (const entry of joined) {
    const separator = entry.indexOf('=');
    const field = separator < 0 ? entry.trim() : entry.slice(0, separator).trim();
    const value = separator < 0 ? '' : entry.slice(separator + 1).trim();
    if (!Dispatch.isCanonicalField(field)) throw new DispatchUsageError(`--defaults: unknown field "${field}"`);
    if (value === '') throw new DispatchUsageError(`--defaults: missing value for ${field} (use ${field}=value)`);
    values.set(field, value);
  }
  return values;
}
