import { isCanonicalField } from './canonicalFields.js';
import type { CanonicalField } from './CanonicalField.js';
import type { FieldValues } from './FieldValues.js';
import type { MappingFillTransform } from './MappingFillTransform.js';
import type { MappingNormalizeTransform } from './MappingNormalizeTransform.js';
import type { MappingProfile } from './MappingProfile.js';
import type { MappingTransform } from './MappingTransform.js';
import { isFillTransform } from './mappingTransformOps.js';

/**
 * Maps a raw input row to canonical field values (§7.3). Pure.
 *
 * Values are trimmed and empty values dropped. When several columns map the
 * same field, the first non-empty one in profile order wins. The normalizing
 * transforms (`trim`, `upper`, `emptyIfIn`, `map`) run afterwards, field by
 * field, in profile order. Fill transforms (`constantIfPresent`, `default`)
 * do **not** run here: see {@link applyFillTransforms}.
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

  for (const [field, steps] of transformEntries(profile)) {
    for (const step of steps) {
      if (!isFillTransform(step)) setOrDelete(values, field, normalize(values.get(field), step));
    }
  }
  return values;
}

/**
 * Merges value layers by precedence: earlier layers win (§7.4.2:
 * row > CLI > environment).
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

/**
 * Applies the fill transforms of a profile (`constantIfPresent`, `default`)
 * to already merged values. Pure.
 *
 * They only fill fields that are still empty, so their precedence is
 * row > CLI > environment > **profile fills** > neutral defaults of the code
 * (§7.4.2). `constantIfPresent` looks at the merged values, so a trigger set
 * from CLI or environment counts too. Fields are processed in profile order.
 *
 * @param merged - Values merged with {@link mergeFieldValues}
 * @param profile - Validated mapping profile
 * @returns The merged values plus the filled fields
 */
export function applyFillTransforms(merged: FieldValues, profile: MappingProfile): FieldValues {
  const values = new Map<CanonicalField, string>(merged);
  for (const [field, steps] of transformEntries(profile)) {
    for (const step of steps) {
      if (isFillTransform(step) && !values.has(field)) setOrDelete(values, field, fill(values, step));
    }
  }
  return values;
}

function transformEntries(
  profile: MappingProfile,
): ReadonlyArray<readonly [CanonicalField, ReadonlyArray<MappingTransform>]> {
  return Object.entries(profile.transforms ?? {}).flatMap(([field, steps]) =>
    isCanonicalField(field) && steps !== undefined ? [[field, steps] as const] : [],
  );
}

function normalize(current: string | undefined, step: MappingNormalizeTransform): string | undefined {
  if (current === undefined) return undefined;
  switch (step.op) {
    case 'trim':
      return current.trim();
    case 'upper':
      return current.toUpperCase();
    case 'emptyIfIn': {
      const upper = current.toUpperCase();
      return step.values.some((item) => item.toUpperCase() === upper) ? undefined : current;
    }
    case 'map':
      return Object.hasOwn(step.values, current) ? step.values[current] : current;
    default: {
      const exhaustive: never = step;
      throw new Error(`Unhandled transform ${JSON.stringify(exhaustive)}`);
    }
  }
}

function fill(values: ReadonlyMap<CanonicalField, string>, step: MappingFillTransform): string | undefined {
  switch (step.op) {
    case 'constantIfPresent':
      return values.has(step.field) ? step.value : undefined;
    case 'default':
      return step.value;
    default: {
      const exhaustive: never = step;
      throw new Error(`Unhandled transform ${JSON.stringify(exhaustive)}`);
    }
  }
}

function setOrDelete(values: Map<CanonicalField, string>, field: CanonicalField, value: string | undefined): void {
  if (value === undefined || value === '') values.delete(field);
  else values.set(field, value);
}
