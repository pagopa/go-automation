import { trimToUndefined } from '@go-automation/go-common/core';

import type { RunbookResultField } from './RunbookOutputContext.js';

/** Placeholder CloudWatch and API Gateway access logs write for "field not present". */
const ABSENT_FIELD_PLACEHOLDER = '-';

/**
 * Normalises a raw runbook `vars` / `params` value for output.
 *
 * Adds the log-domain rule on top of `trimToUndefined`: the literal `-` is
 * what CloudWatch and API Gateway write for a field they did not capture, so
 * it carries no more information than a missing value.
 *
 * @param value - Raw value read from `vars`, `params` or a log row
 * @returns The trimmed value, or `undefined` when it carries no content
 *
 * @example
 * ```typescript
 * normalizeOutputValue('  504 '); // '504'
 * normalizeOutputValue('-');      // undefined
 * ```
 */
export function normalizeOutputValue(value: string | undefined): string | undefined {
  const trimmed = trimToUndefined(value);
  return trimmed === ABSENT_FIELD_PLACEHOLDER ? undefined : trimmed;
}

/**
 * Builds a single-key fragment for spreading into an output context, or an
 * empty object when the value is absent.
 *
 * Required by `exactOptionalPropertyTypes`, which forbids assigning an
 * explicit `undefined` to an optional property.
 *
 * @param key - Property name to emit
 * @param value - Raw value, normalised before emission
 * @returns `{ [key]: value }`, or `{}` when the value carries no content
 *
 * @example
 * ```typescript
 * const alarm = { ...optionalString('name', params.get('alarmName')) };
 * ```
 */
export function optionalString<K extends string>(key: K, value: string | undefined): { readonly [P in K]?: string } {
  const normalized = normalizeOutputValue(value);
  return normalized === undefined ? {} : ({ [key]: normalized } as { readonly [P in K]?: string });
}

/**
 * Numeric counterpart of {@link optionalString}. The value is emitted as-is:
 * callers parse it with `parseInteger` / `parseFiniteNumber` from go-common.
 *
 * @param key - Property name to emit
 * @param value - Value to emit when defined
 * @returns `{ [key]: value }`, or `{}` when the value is `undefined`
 */
export function optionalNumber<K extends string>(key: K, value: number | undefined): { readonly [P in K]?: number } {
  return value === undefined ? {} : ({ [key]: value } as { readonly [P in K]?: number });
}

/**
 * Appends a result field to `fields`, skipping values that carry no content.
 *
 * Mutates `fields` in place: the three analyzer families each assemble a
 * flat, ordered list of a dozen fields, and an accumulator keeps those call
 * sites to one line per field.
 *
 * @param fields - Accumulator to append to
 * @param name - Machine-readable field name
 * @param label - Human-readable label rendered in the report
 * @param value - Raw value, normalised before emission
 */
export function addResultField(
  fields: RunbookResultField[],
  name: string,
  label: string,
  value: string | undefined,
): void {
  const normalized = normalizeOutputValue(value);
  if (normalized === undefined) return;
  fields.push({ name, label, value: normalized });
}
