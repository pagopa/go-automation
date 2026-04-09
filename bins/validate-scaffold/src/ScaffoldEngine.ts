import * as fs from 'fs/promises';
import * as path from 'path';

import type {
  FileContainsRule,
  FileExistsRule,
  FileNotContainsRule,
  JsonHasKeyRule,
  JsonKeyEqualsRule,
  RuleResult,
  ScaffoldRule,
} from './types/index.js';

/**
 * Converts a simple glob pattern (with `*` wildcards) into a RegExp.
 * Only supports `*` — no `**`, `?`, or brace expansion.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('.*')}$`);
}

/**
 * Traverses a nested object using a dot-notation key path.
 * Returns `undefined` if any segment is missing.
 *
 * @example
 * ```typescript
 * getNestedValue({ a: { b: 1 } }, 'a.b') // 1
 * getNestedValue({ a: { b: 1 } }, 'a.c') // undefined
 * ```
 */
function getNestedValue(obj: unknown, keyPath: string): unknown {
  let current: unknown = obj;
  for (const key of keyPath.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Validates script directories against a set of scaffold rules.
 *
 * Supports six check types:
 * - `file-exists`: glob pattern match in a directory
 * - `file-contains`: RegExp match in file content
 * - `file-not-contains`: RegExp must NOT match in file content
 * - `json-has-key`: dot-notation key exists in a JSON file
 * - `json-key-equals`: dot-notation key equals a specific value
 * - `custom`: arbitrary async validation function
 */
export class ScaffoldEngine {
  constructor(private readonly rules: ReadonlyArray<ScaffoldRule>) {}

  /**
   * Runs all rules against a script directory and returns results.
   *
   * @param scriptPath - Absolute path to the script directory
   * @returns Array of results, one per rule
   */
  async validate(scriptPath: string): Promise<ReadonlyArray<RuleResult>> {
    const results: RuleResult[] = [];
    for (const rule of this.rules) {
      results.push(await this.runRule(rule, scriptPath));
    }
    return results;
  }

  private async runRule(rule: ScaffoldRule, scriptPath: string): Promise<RuleResult> {
    switch (rule.check) {
      case 'file-exists':
        return this.checkFileExists(rule, scriptPath);
      case 'file-contains':
        return this.checkFileContains(rule, scriptPath);
      case 'file-not-contains':
        return this.checkFileNotContains(rule, scriptPath);
      case 'json-has-key':
        return this.checkJsonHasKey(rule, scriptPath);
      case 'json-key-equals':
        return this.checkJsonKeyEquals(rule, scriptPath);
      case 'custom': {
        const result = await rule.validate(scriptPath);
        return result;
      }
      default: {
        const exhaustiveCheck: never = rule;
        throw new Error(`Unknown check type: ${JSON.stringify(exhaustiveCheck)}`);
      }
    }
  }

  private async checkFileExists(rule: FileExistsRule, scriptPath: string): Promise<RuleResult> {
    const target = path.join(scriptPath, rule.glob);

    if (!rule.glob.includes('*')) {
      try {
        await fs.access(target);
        return { rule: rule.name, passed: true };
      } catch {
        return {
          rule: rule.name,
          passed: false,
          message: `File "${rule.glob}" not found`,
        };
      }
    }

    const dir = path.dirname(target);
    const pattern = path.basename(target);
    const regex = globToRegex(pattern);

    try {
      const files = await fs.readdir(dir);
      if (files.some((f) => regex.test(f))) {
        return { rule: rule.name, passed: true };
      }
      return {
        rule: rule.name,
        passed: false,
        message: `No file matching "${rule.glob}"`,
      };
    } catch {
      return {
        rule: rule.name,
        passed: false,
        message: `Directory "${path.dirname(rule.glob)}" not found`,
      };
    }
  }

  private async checkFileContains(rule: FileContainsRule, scriptPath: string): Promise<RuleResult> {
    const filePath = path.join(scriptPath, rule.file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (rule.pattern.test(content)) {
        return { rule: rule.name, passed: true };
      }
      return {
        rule: rule.name,
        passed: false,
        message: `Pattern not found in ${rule.file}`,
      };
    } catch {
      return {
        rule: rule.name,
        passed: false,
        message: `File "${rule.file}" not found`,
      };
    }
  }

  private async checkFileNotContains(rule: FileNotContainsRule, scriptPath: string): Promise<RuleResult> {
    const filePath = path.join(scriptPath, rule.file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const match = rule.pattern.exec(content);
      if (match === null) {
        return { rule: rule.name, passed: true };
      }
      const line = content.substring(0, match.index).split('\n').length;
      return {
        rule: rule.name,
        passed: false,
        message: `Match in ${rule.file}:${String(line)}`,
      };
    } catch {
      // File doesn't exist → cannot contain the pattern → passes
      return { rule: rule.name, passed: true };
    }
  }

  private async checkJsonHasKey(rule: JsonHasKeyRule, scriptPath: string): Promise<RuleResult> {
    const filePath = path.join(scriptPath, rule.file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const json: unknown = JSON.parse(content);
      const value = getNestedValue(json, rule.key);
      if (value !== undefined) {
        return { rule: rule.name, passed: true };
      }
      return {
        rule: rule.name,
        passed: false,
        message: `Key "${rule.key}" not found in ${rule.file}`,
      };
    } catch {
      return {
        rule: rule.name,
        passed: false,
        message: `Cannot read or parse ${rule.file}`,
      };
    }
  }

  private async checkJsonKeyEquals(rule: JsonKeyEqualsRule, scriptPath: string): Promise<RuleResult> {
    const filePath = path.join(scriptPath, rule.file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const json: unknown = JSON.parse(content);
      const value = getNestedValue(json, rule.key);
      if (value === rule.value) {
        return { rule: rule.name, passed: true };
      }
      return {
        rule: rule.name,
        passed: false,
        message: `Expected "${rule.key}" = ${JSON.stringify(rule.value)}, got ${JSON.stringify(value)}`,
      };
    } catch {
      return {
        rule: rule.name,
        passed: false,
        message: `Cannot read or parse ${rule.file}`,
      };
    }
  }
}
