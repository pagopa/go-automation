import type { CanonicalField } from './CanonicalField.js';
import type { FieldValues } from './FieldValues.js';
import type { MappingProfile } from './MappingProfile.js';
import type { MappingTransform } from './MappingTransform.js';
import type { MappingTransformValues } from './MappingTransformValues.js';

/**
 * Maps a raw input row to canonical field values (§7.3). Pure.
 *
 * Values are trimmed and empty values dropped. When several columns map the
 * same field, the first non-empty one in profile order wins. Transforms run
 * afterwards, field by field, in profile order.
 *
 * @param raw - Row as read from the input (flat; JSON is flattened with dots)
 * @param profile - Validated mapping profile
 * @returns Canonical values of the row
 */
export function mapRow(raw: Readonly<Record<string, string>>, profile: MappingProfile): FieldValues {
  const values = new Map<CanonicalField, string>();
  for (const [column, field] of Object.entries(profile.columns)) {
    if (values.has(field)) continue;
    const value = raw[column]?.trim();
    if (value !== undefined && value !== '') values.set(field, value);
  }

  for (const [field, steps] of Object.entries(profile.transforms ?? {})) {
    const canonical = field as CanonicalField; // Safe: keys validated by parseMappingProfile
    for (const step of steps ?? []) applyTransform(values, canonical, step);
  }
  return values;
}

/**
 * Merges value layers by precedence: earlier layers win (§7.4.2:
 * row > CLI > environment > neutral defaults).
 *
 * @param layers - Value layers, highest precedence first
 * @returns Merged values
 */
export function mergeFieldValues(...layers: ReadonlyArray<FieldValues>): FieldValues {
  const merged = new Map<CanonicalField, string>();
  for (const layer of layers) {
    for (const [field, value] of layer) {
      if (!merged.has(field)) merged.set(field, value);
    }
  }
  return merged;
}

function applyTransform(values: Map<CanonicalField, string>, field: CanonicalField, step: MappingTransform): void {
  const current = values.get(field);
  let next: string | undefined;
  switch (step.op) {
    case 'trim':
      next = current?.trim();
      break;
    case 'upper':
      next = current?.toUpperCase();
      break;
    case 'emptyIfIn': {
      const list = asList(step.values);
      const upper = current?.toUpperCase();
      next = upper !== undefined && list.some((item) => item.toUpperCase() === upper) ? undefined : current;
      break;
    }
    case 'map': {
      const dictionary = asDictionary(step.values);
      next = current !== undefined && Object.hasOwn(dictionary, current) ? dictionary[current] : current;
      break;
    }
    case 'constantIfPresent':
      // Only fills an empty field: an explicit value in the input is kept and validated.
      next = current === undefined && step.field !== undefined && values.has(step.field) ? step.value : current;
      break;
    case 'default':
      next = current ?? step.value;
      break;
    default: {
      const exhaustive: never = step.op;
      throw new Error(`Unhandled transform ${String(exhaustive)}`);
    }
  }
  if (next === undefined || next === '') values.delete(field);
  else values.set(field, next);
}

function asList(values: MappingTransformValues | undefined): ReadonlyArray<string> {
  return Array.isArray(values) ? (values as ReadonlyArray<string>) : []; // Safe: validated by parseMappingProfile
}

function asDictionary(values: MappingTransformValues | undefined): Readonly<Record<string, string>> {
  return values === undefined || Array.isArray(values) ? {} : (values as Readonly<Record<string, string>>); // Safe: idem
}
