import { isCanonicalField } from './canonicalFields.js';
import type { CanonicalField } from './CanonicalField.js';
import type { MappingFormat } from './MappingFormat.js';
import type { MappingProfile } from './MappingProfile.js';
import type { MappingTransform } from './MappingTransform.js';
import type { MappingTransformOp } from './MappingTransformOp.js';

const PROFILE_KEYS: ReadonlySet<string> = new Set([
  'name',
  'format',
  'columns',
  'transforms',
  'rowKeyColumn',
  'outputColumns',
]);
const FORMAT_KEYS: ReadonlySet<string> = new Set(['type', 'delimiter', 'skipRows', 'encoding']);
const OPS: ReadonlySet<string> = new Set<MappingTransformOp>([
  'trim',
  'upper',
  'emptyIfIn',
  'map',
  'constantIfPresent',
  'default',
]);

/**
 * Validates an untrusted value (a parsed JSON file) as a mapping profile.
 *
 * Unknown keys, unknown canonical fields and transforms with missing
 * parameters are rejected, with a message naming the offending path.
 *
 * @param value - Parsed JSON
 * @param source - Name used in error messages (file path or profile name)
 * @returns The validated profile
 * @throws Error describing the first problem found
 */
export function parseMappingProfile(value: unknown, source: string): MappingProfile {
  const profile = asRecord(value, source);
  rejectUnknownKeys(profile, PROFILE_KEYS, source);

  const name = profile['name'];
  if (typeof name !== 'string' || name.trim() === '') throw new Error(`${source}: "name" must be a non-empty string`);

  const columns = parseColumns(profile['columns'], `${source}.columns`);
  const transforms =
    profile['transforms'] === undefined ? undefined : parseTransforms(profile['transforms'], `${source}.transforms`);
  const format = profile['format'] === undefined ? undefined : parseFormat(profile['format'], `${source}.format`);
  const rowKeyColumn = optionalString(profile['rowKeyColumn'], `${source}.rowKeyColumn`);
  const outputColumns = profile['outputColumns'] === undefined ? undefined : asRecord(profile['outputColumns'], source);
  if (outputColumns !== undefined)
    rejectUnknownKeys(outputColumns, new Set(['iun', 'requestId']), `${source}.outputColumns`);
  const iun = optionalString(outputColumns?.['iun'], `${source}.outputColumns.iun`);
  const requestId = optionalString(outputColumns?.['requestId'], `${source}.outputColumns.requestId`);

  return {
    name,
    columns,
    ...(format !== undefined && { format }),
    ...(transforms !== undefined && { transforms }),
    ...(rowKeyColumn !== undefined && { rowKeyColumn }),
    ...(outputColumns !== undefined && {
      outputColumns: { ...(iun !== undefined && { iun }), ...(requestId !== undefined && { requestId }) },
    }),
  };
}

function parseColumns(value: unknown, path: string): Readonly<Record<string, CanonicalField>> {
  const record = asRecord(value, path);
  const columns: Record<string, CanonicalField> = {};
  for (const [column, field] of Object.entries(record)) {
    columns[column] = canonicalField(field, `${path}.${column}`);
  }
  if (Object.keys(columns).length === 0) throw new Error(`${path}: at least one column is required`);
  return columns;
}

function parseTransforms(
  value: unknown,
  path: string,
): Readonly<Partial<Record<CanonicalField, ReadonlyArray<MappingTransform>>>> {
  const record = asRecord(value, path);
  const transforms: Partial<Record<CanonicalField, ReadonlyArray<MappingTransform>>> = {};
  for (const [field, steps] of Object.entries(record)) {
    const fieldPath = `${path}.${field}`;
    const canonical = canonicalField(field, fieldPath);
    if (!Array.isArray(steps)) throw new Error(`${fieldPath}: must be an array of transforms`);
    transforms[canonical] = steps.map((step, index) => parseTransform(step, `${fieldPath}[${index}]`));
  }
  return transforms;
}

function parseTransform(value: unknown, path: string): MappingTransform {
  const step = asRecord(value, path);
  rejectUnknownKeys(step, new Set(['op', 'values', 'field', 'value']), path);
  const op = step['op'];
  if (typeof op !== 'string' || !OPS.has(op)) throw new Error(`${path}.op: unknown transform "${String(op)}"`);
  const typedOp = op as MappingTransformOp; // Safe: checked against OPS above
  switch (typedOp) {
    case 'trim':
    case 'upper':
      return { op: typedOp };
    case 'emptyIfIn':
      return { op: typedOp, values: stringArray(step['values'], `${path}.values`) };
    case 'map':
      return { op: typedOp, values: stringRecord(step['values'], `${path}.values`) };
    case 'constantIfPresent':
      return {
        op: typedOp,
        field: canonicalField(step['field'], `${path}.field`),
        value: requiredString(step['value'], `${path}.value`),
      };
    case 'default':
      return { op: typedOp, value: requiredString(step['value'], `${path}.value`) };
    default: {
      const exhaustive: never = typedOp;
      throw new Error(`${path}.op: unhandled transform ${String(exhaustive)}`);
    }
  }
}

function parseFormat(value: unknown, path: string): MappingFormat {
  const format = asRecord(value, path);
  rejectUnknownKeys(format, FORMAT_KEYS, path);
  const type = format['type'];
  if (type !== undefined && type !== 'csv' && type !== 'json' && type !== 'jsonl') {
    throw new Error(`${path}.type: must be csv, json or jsonl`);
  }
  const skipRows = format['skipRows'];
  if (skipRows !== undefined && (!Number.isInteger(skipRows) || (skipRows as number) < 0)) {
    throw new Error(`${path}.skipRows: must be a non-negative integer`);
  }
  const delimiter = optionalString(format['delimiter'], `${path}.delimiter`);
  const encoding = optionalString(format['encoding'], `${path}.encoding`);
  if (encoding !== undefined && !Buffer.isEncoding(encoding)) throw new Error(`${path}.encoding: unknown encoding`);
  return {
    ...(type !== undefined && { type }),
    ...(delimiter !== undefined && { delimiter }),
    ...(skipRows !== undefined && { skipRows: skipRows as number }),
    ...(encoding !== undefined && { encoding }),
  };
}

function canonicalField(value: unknown, path: string): CanonicalField {
  if (typeof value !== 'string' || !isCanonicalField(value)) {
    throw new Error(`${path}: unknown canonical field "${String(value)}"`);
  }
  return value;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${path}: must be an object`);
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${path}: unknown key "${key}"`);
  }
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, path);
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${path}: must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, path: string): ReadonlyArray<string> {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error(`${path}: must be an array of strings`);
  }
  return value;
}

function stringRecord(value: unknown, path: string): Readonly<Record<string, string>> {
  const record = asRecord(value, path);
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string') throw new Error(`${path}.${key}: must be a string`);
  }
  return record as Record<string, string>; // Safe: every value checked above
}
