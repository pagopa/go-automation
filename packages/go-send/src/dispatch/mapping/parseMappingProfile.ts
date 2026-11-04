import {
  asRecord,
  optionalString,
  rejectUnknownKeys,
  requiredString,
  stringList,
  stringRecord,
} from '../config/configGuards.js';
import { isCanonicalField } from './canonicalFields.js';
import type { CanonicalField } from './CanonicalField.js';
import type { MappingFormat } from './MappingFormat.js';
import type { MappingOutputColumns } from './MappingOutputColumns.js';
import type { MappingProfile } from './MappingProfile.js';
import type { MappingTransform } from './MappingTransform.js';
import type { MappingTransforms } from './MappingTransforms.js';
import { isFillTransform, isMappingTransformOp } from './mappingTransformOps.js';

const PROFILE_KEYS: ReadonlySet<string> = new Set([
  'name',
  'format',
  'columns',
  'transforms',
  'rowKeyColumn',
  'outputColumns',
]);
const FORMAT_KEYS: ReadonlySet<string> = new Set(['type', 'delimiter', 'skipRows', 'encoding']);
const OUTPUT_COLUMN_KEYS: ReadonlySet<string> = new Set(['iun', 'requestId']);
const TRANSFORM_KEYS: ReadonlySet<string> = new Set(['op', 'values', 'field', 'value']);

/**
 * Validates an untrusted value (a parsed JSON file) as a mapping profile.
 *
 * Unknown keys, unknown canonical fields and transforms with missing
 * parameters are rejected, with a message naming the offending path. String
 * parameters are trimmed and must not be blank. Within the steps of a field,
 * normalizing transforms must precede fill transforms, because fills run
 * after the merge with CLI and environment values (see `applyFillTransforms`).
 *
 * @param value - Parsed JSON
 * @param source - Name used in error messages (file path or profile name)
 * @returns The validated profile
 * @throws Error describing the first problem found
 */
export function parseMappingProfile(value: unknown, source: string): MappingProfile {
  const profile = asRecord(value, source);
  rejectUnknownKeys(profile, PROFILE_KEYS, source);

  const name = requiredString(profile['name'], `${source}.name`);
  const columns = parseColumns(profile['columns'], `${source}.columns`);
  const transforms =
    profile['transforms'] === undefined ? undefined : parseTransforms(profile['transforms'], `${source}.transforms`);
  const format = profile['format'] === undefined ? undefined : parseFormat(profile['format'], `${source}.format`);
  const rowKeyColumn = optionalString(profile['rowKeyColumn'], `${source}.rowKeyColumn`);
  const outputColumns =
    profile['outputColumns'] === undefined
      ? undefined
      : parseOutputColumns(profile['outputColumns'], `${source}.outputColumns`);

  return {
    name,
    columns,
    ...(format !== undefined && { format }),
    ...(transforms !== undefined && { transforms }),
    ...(rowKeyColumn !== undefined && { rowKeyColumn }),
    ...(outputColumns !== undefined && { outputColumns }),
  };
}

function parseColumns(value: unknown, path: string): Readonly<Record<string, CanonicalField>> {
  const entries = Object.entries(asRecord(value, path)).map(([column, field]): readonly [string, CanonicalField] => [
    column,
    canonicalField(field, `${path}.${column}`),
  ]);
  if (entries.length === 0) throw new Error(`${path}: at least one column is required`);
  return Object.fromEntries(entries);
}

function parseTransforms(value: unknown, path: string): MappingTransforms {
  const transforms: Partial<Record<CanonicalField, ReadonlyArray<MappingTransform>>> = {};
  for (const [field, steps] of Object.entries(asRecord(value, path))) {
    const fieldPath = `${path}.${field}`;
    const canonical = canonicalField(field, fieldPath);
    if (!Array.isArray(steps)) throw new Error(`${fieldPath}: must be an array of transforms`);
    const items: ReadonlyArray<unknown> = steps;
    const parsed = items.map((step, index) => parseTransform(step, `${fieldPath}[${index}]`));
    assertFillsLast(parsed, fieldPath);
    transforms[canonical] = parsed;
  }
  return transforms;
}

/** A normalizing step after a fill would never see the filled value: reject the ambiguous order. */
function assertFillsLast(steps: ReadonlyArray<MappingTransform>, path: string): void {
  let fillSeen = false;
  for (const [index, step] of steps.entries()) {
    if (isFillTransform(step)) fillSeen = true;
    else if (fillSeen) {
      throw new Error(
        `${path}[${index}]: "${step.op}" must come before constantIfPresent/default ` +
          '(fills apply after merging CLI and environment values)',
      );
    }
  }
}

function parseTransform(value: unknown, path: string): MappingTransform {
  const step = asRecord(value, path);
  rejectUnknownKeys(step, TRANSFORM_KEYS, path);
  const op = step['op'];
  if (!isMappingTransformOp(op)) throw new Error(`${path}.op: unknown transform "${String(op)}"`);
  switch (op) {
    case 'trim':
    case 'upper':
      return { op };
    case 'emptyIfIn':
      return { op, values: stringList(step['values'], `${path}.values`) };
    case 'map':
      return { op, values: stringRecord(step['values'], `${path}.values`) };
    case 'constantIfPresent':
      return {
        op,
        field: canonicalField(step['field'], `${path}.field`),
        value: requiredString(step['value'], `${path}.value`),
      };
    case 'default':
      return { op, value: requiredString(step['value'], `${path}.value`) };
    default: {
      const exhaustive: never = op;
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
  if (skipRows !== undefined && (typeof skipRows !== 'number' || !Number.isInteger(skipRows) || skipRows < 0)) {
    throw new Error(`${path}.skipRows: must be a non-negative integer`);
  }
  // Not trimmed: a tab is a valid delimiter.
  const delimiter = format['delimiter'];
  if (delimiter !== undefined && (typeof delimiter !== 'string' || delimiter === '')) {
    throw new Error(`${path}.delimiter: must be a non-empty string`);
  }
  const encoding = optionalString(format['encoding'], `${path}.encoding`);
  if (encoding !== undefined && !Buffer.isEncoding(encoding)) throw new Error(`${path}.encoding: unknown encoding`);
  return {
    ...(type !== undefined && { type }),
    ...(delimiter !== undefined && { delimiter }),
    ...(skipRows !== undefined && { skipRows }),
    ...(encoding !== undefined && { encoding }),
  };
}

function parseOutputColumns(value: unknown, path: string): MappingOutputColumns {
  const outputColumns = asRecord(value, path);
  rejectUnknownKeys(outputColumns, OUTPUT_COLUMN_KEYS, path);
  const iun = optionalString(outputColumns['iun'], `${path}.iun`);
  const requestId = optionalString(outputColumns['requestId'], `${path}.requestId`);
  return { ...(iun !== undefined && { iun }), ...(requestId !== undefined && { requestId }) };
}

function canonicalField(value: unknown, path: string): CanonicalField {
  if (typeof value !== 'string' || !isCanonicalField(value)) {
    throw new Error(`${path}: unknown canonical field "${String(value)}"`);
  }
  return value;
}
