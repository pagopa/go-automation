import * as fs from 'fs/promises';
import * as path from 'path';

import type { ValidateScaffoldConfig, ValidationGroupConfig } from './types/ValidateScaffoldConfig.js';
import { RULE_SET_NAMES, isRuleSetName } from './types/ValidateScaffoldConfig.js';

const CONFIG_FILE = 'validate-scaffold.config.json';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRelativePath(value: string, context: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\.\//, '') || '.';

  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`${context}: absolute paths are not allowed: ${value}`);
  }

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

function readStringArray(value: unknown, context: string): ReadonlyArray<string> | undefined {
  if (value === undefined) return undefined;

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${context}: expected non-empty string[]`);
  }

  const items = value as string[];
  return items.map((item, index) => normalizeRelativePath(item, `${context}[${String(index)}]`));
}

function parseGroup(value: unknown, index: number): ValidationGroupConfig {
  const context = `groups[${String(index)}]`;

  if (!isObject(value)) {
    throw new Error(`${context}: expected object`);
  }

  const name = readRequiredString(value['name'], `${context}.name`);
  const ruleSetValue = readRequiredString(value['ruleSet'], `${context}.ruleSet`);

  if (!isRuleSetName(ruleSetValue)) {
    throw new Error(`${context}.ruleSet: expected one of ${RULE_SET_NAMES.join(', ')}`);
  }

  const paths = readStringArray(value['paths'], `${context}.paths`);
  const include = readStringArray(value['include'], `${context}.include`);
  const exclude = readStringArray(value['exclude'], `${context}.exclude`) ?? [];

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
