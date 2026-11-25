import * as fs from 'node:fs/promises';

import type { AllowedValue } from './types/AllowedValue.js';
import type { SensitiveDataConfig } from './types/SensitiveDataConfig.js';
import type { SensitiveDataException } from './types/SensitiveDataException.js';

/**
 * Reads and validates the gate configuration.
 *
 * @param configPath - Path of `published-sensitive-data.config.json`
 * @returns The validated configuration
 * @throws Error when the file is malformed or an allowance has no reason
 */
export async function loadSensitiveDataConfig(configPath: string): Promise<SensitiveDataConfig> {
  const raw: unknown = JSON.parse(await fs.readFile(configPath, 'utf8'));
  return parseSensitiveDataConfig(raw);
}

/**
 * Validates a parsed configuration object.
 *
 * @param raw - Parsed JSON
 * @returns The validated configuration
 * @throws Error when a field is missing or malformed
 */
export function parseSensitiveDataConfig(raw: unknown): SensitiveDataConfig {
  if (!isRecord(raw)) throw new Error('the configuration must be a JSON object');
  return {
    allowedAccountIds: allowedValues(raw['allowedAccountIds'], 'allowedAccountIds'),
    profileNames: strings(raw['profileNames'], 'profileNames'),
    profilePrefixes: strings(raw['profilePrefixes'], 'profilePrefixes'),
    forbiddenPathSegments: strings(raw['forbiddenPathSegments'], 'forbiddenPathSegments'),
    forbiddenSuffixes: strings(raw['forbiddenSuffixes'], 'forbiddenSuffixes'),
    exceptions: exceptions(raw['exceptions']),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown, field: string): ReadonlyArray<string> {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string' && item !== '')) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value;
}

function reasonOf(item: Readonly<Record<string, unknown>>, field: string): string {
  const reason = item['reason'];
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error(`every ${field} entry needs a reason`);
  return reason;
}

function stringField(item: Readonly<Record<string, unknown>>, key: string, field: string): string {
  const value = item[key];
  if (typeof value !== 'string' || value === '') throw new Error(`every ${field} entry needs a non-empty ${key}`);
  return value;
}

function allowedValues(value: unknown, field: string): ReadonlyArray<AllowedValue> {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item: unknown) => {
    if (!isRecord(item)) throw new Error(`${field} entries must be objects`);
    return { value: stringField(item, 'value', field), reason: reasonOf(item, field) };
  });
}

function exceptions(value: unknown): ReadonlyArray<SensitiveDataException> {
  if (!Array.isArray(value)) throw new Error('exceptions must be an array');
  return value.map((item: unknown) => {
    if (!isRecord(item)) throw new Error('exceptions entries must be objects');
    return {
      package: stringField(item, 'package', 'exceptions'),
      file: stringField(item, 'file', 'exceptions'),
      value: stringField(item, 'value', 'exceptions'),
      reason: reasonOf(item, 'exceptions'),
    };
  });
}
