import * as fs from 'fs/promises';
import * as path from 'path';

import type { ValidateScaffoldConfig, ValidationGroupConfig } from './types/ValidateScaffoldConfig.js';
import { RULE_SET_NAMES, isRuleSetName } from './types/ValidateScaffoldConfig.js';

const CONFIG_FILE = 'validate-scaffold.config.json';
const GROUP_KEYS = new Set(['name', 'ruleSet', 'paths', 'include', 'exclude']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>, context: string): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context}: unexpected key "${key}"`);
    }
  }
}

function normalizeRelativePath(value: string, context: string): string {
  const slashNormalized = value.replace(/\\/g, '/');
  if (path.isAbsolute(slashNormalized) || /^[A-Za-z]:/.test(slashNormalized)) {
    throw new Error(`${context}: absolute paths are not allowed: ${value}`);
  }

  const normalized = slashNormalized.replace(/\/+$/, '').replace(/^\.\//, '') || '.';

  if (normalized.split('/').includes('..')) {
    throw new Error(`${context}: parent traversal is not allowed: ${value}`);
  }

  return normalized;
}

function readRequiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}: expected non-empty string`);
  }

  return value;
}

interface ReadStringArrayOptions {
  readonly allowEmpty: boolean;
}

function readStringArray(
  value: unknown,
  context: string,
  options: ReadStringArrayOptions,
): ReadonlyArray<string> | undefined {
  if (value === undefined) return undefined;

  const expected = options.allowEmpty ? 'string[]' : 'non-empty string[]';
  if (
    !Array.isArray(value) ||
    (!options.allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new Error(`${context}: expected ${expected}`);
  }

  const items = value as string[];
  return items.map((item, index) => normalizeRelativePath(item, `${context}[${String(index)}]`));
}

function parseGroup(value: unknown, index: number): ValidationGroupConfig {
  const context = `groups[${String(index)}]`;

  if (!isObject(value)) {
    throw new Error(`${context}: expected object`);
  }
  assertAllowedKeys(value, GROUP_KEYS, context);

  const name = readRequiredString(value['name'], `${context}.name`);
  const ruleSetValue = readRequiredString(value['ruleSet'], `${context}.ruleSet`);

  if (!isRuleSetName(ruleSetValue)) {
    throw new Error(`${context}.ruleSet: expected one of ${RULE_SET_NAMES.join(', ')}`);
  }

  const paths = readStringArray(value['paths'], `${context}.paths`, { allowEmpty: false });
  const include = readStringArray(value['include'], `${context}.include`, { allowEmpty: false });
  const exclude = readStringArray(value['exclude'], `${context}.exclude`, { allowEmpty: true }) ?? [];

  if ((paths === undefined) === (include === undefined)) {
    throw new Error(`${context}: specify exactly one of "paths" or "include"`);
  }

  return {
    name,
    ruleSet: ruleSetValue,
    ...(paths !== undefined && { paths }),
    ...(include !== undefined && { include }),
    exclude,
  };
}

export async function loadValidateScaffoldConfig(rootDir: string): Promise<ValidateScaffoldConfig> {
  const configPath = path.join(rootDir, CONFIG_FILE);

  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch {
    throw new Error(`${CONFIG_FILE} not found at ${rootDir}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${CONFIG_FILE}: invalid JSON: ${message}`, { cause: error });
  }

  if (!isObject(parsed)) {
    throw new Error(`${CONFIG_FILE}: expected root object`);
  }

  const groups = parsed['groups'];
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error(`${CONFIG_FILE}: "groups" must be a non-empty array`);
  }

  return {
    groups: groups.map(parseGroup),
  };
}
