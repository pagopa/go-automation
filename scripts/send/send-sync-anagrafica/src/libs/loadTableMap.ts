/**
 * Reads configs/tables.json, which says what each anagrafica table is.
 *
 * The map is data rather than code because it carries resource names: table
 * names, the account that owns each one, and its key schema. It is validated
 * on load and every problem is reported at once, the way send-triage-dlq
 * validates a ruleset: this file is written by hand and then pointed at real
 * accounts.
 */

import { GOJSONFileImporter } from '@pagopa/go-common/importers';
import type { AnagraficaTable, ProtectedKey, SyncMode } from '../types/index.js';

/** Accounts a table may belong to. */
const ACCOUNTS: ReadonlyArray<string> = ['core', 'confinfo'];

/** Write modes a table may declare. */
const SYNC_MODES: ReadonlyArray<string> = ['replace', 'merge'];

/**
 * Mode assumed when a table does not declare one.
 *
 * `replace` matches the reference, where `SyncMode` is absent on fifteen of
 * seventeen tables and the fall-through branch is the batched put.
 */
const DEFAULT_SYNC_MODE: SyncMode = 'replace';

/** Reads a record, or nothing when the value is not one. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Validates the optional protected-key block of one table. */
function readProtectedKey(raw: unknown, label: string, errors: string[]): ProtectedKey | undefined {
  if (raw === undefined) return undefined;

  const record = asRecord(raw);
  if (record === undefined) {
    errors.push(`${label}.protectedKey must be an object`);
    return undefined;
  }

  const name = record['name'];
  const values = record['values'];
  if (typeof name !== 'string' || name === '') errors.push(`${label}.protectedKey.name must be a non-empty string`);
  if (!Array.isArray(values) || values.length === 0 || !values.every((entry) => typeof entry === 'string')) {
    errors.push(`${label}.protectedKey.values must be a non-empty array of strings`);
    return undefined;
  }

  return typeof name === 'string' ? { name, values } : undefined;
}

/** Validates one table entry. */
function readTable(name: string, raw: unknown, errors: string[]): AnagraficaTable | undefined {
  const label = `tables['${name}']`;
  const record = asRecord(raw);
  if (record === undefined) {
    errors.push(`${label} must be an object`);
    return undefined;
  }

  const account = record['account'];
  if (typeof account !== 'string' || !ACCOUNTS.includes(account)) {
    errors.push(`${label}.account must be one of ${ACCOUNTS.join(', ')}`);
  }

  const keys = record['keys'];
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every((entry) => typeof entry === 'string')) {
    errors.push(`${label}.keys must be a non-empty array of attribute names`);
    return undefined;
  }
  if (keys.length > 2) {
    // DynamoDB has no third key attribute; a longer list means the file is
    // describing something other than a key schema.
    errors.push(`${label}.keys declares ${String(keys.length)} attributes; a DynamoDB key has at most 2`);
  }

  const protectedKey = readProtectedKey(record['protectedKey'], label, errors);
  if (protectedKey !== undefined && !keys.includes(protectedKey.name)) {
    errors.push(`${label}.protectedKey.name '${protectedKey.name}' is not one of the key attributes`);
  }

  const rawSyncMode = record['syncMode'];
  if (rawSyncMode !== undefined && (typeof rawSyncMode !== 'string' || !SYNC_MODES.includes(rawSyncMode))) {
    errors.push(`${label}.syncMode must be one of ${SYNC_MODES.join(', ')}`);
  }
  const syncMode = typeof rawSyncMode === 'string' && SYNC_MODES.includes(rawSyncMode) ? rawSyncMode : undefined;

  return typeof account === 'string'
    ? { name, account, keys, protectedKey, syncMode: (syncMode as SyncMode | undefined) ?? DEFAULT_SYNC_MODE }
    : undefined;
}

/**
 * Loads and validates the table map.
 *
 * @param inputPath - Path of configs/tables.json
 * @returns Every declared table, in file order
 * @throws Error listing every problem found
 */
export async function loadTableMap(inputPath: string): Promise<ReadonlyArray<AnagraficaTable>> {
  const raw = await new GOJSONFileImporter<Record<string, unknown>>({ inputPath, optional: true }).import();
  if (raw === undefined) throw new Error(`Table map ${inputPath} is missing`);

  const tables = asRecord(raw['tables']);
  if (tables === undefined) throw new Error(`${inputPath}: 'tables' must be an object keyed by table name`);

  const errors: string[] = [];
  const parsed = Object.entries(tables)
    .map(([name, entry]) => readTable(name, entry, errors))
    .filter((entry): entry is AnagraficaTable => entry !== undefined);

  if (errors.length > 0) {
    throw new Error(`${inputPath} is not a valid table map:\n  - ${errors.join('\n  - ')}`);
  }
  if (parsed.length === 0) throw new Error(`${inputPath} declares no table`);

  return parsed;
}
