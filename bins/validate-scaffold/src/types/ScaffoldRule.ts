import type { RuleResult } from './RuleResult.js';

/**
 * Base fields shared by all scaffold rules
 */
interface BaseRule {
  /** Human-readable rule name shown in validation output */
  readonly name: string;
}

/**
 * Checks that at least one file matches a glob pattern relative to the script root.
 * Supports simple `*` wildcards in the filename part (e.g. `src/types/*Config.ts`).
 */
export interface FileExistsRule extends BaseRule {
  readonly check: 'file-exists';
  readonly glob: string;
}

/**
 * Checks that a file's content matches a RegExp pattern.
 * Fails if the file does not exist.
 */
export interface FileContainsRule extends BaseRule {
  readonly check: 'file-contains';
  readonly file: string;
  readonly pattern: RegExp;
}

/**
 * Checks that a file's content does NOT match a RegExp pattern.
 * Passes if the file does not exist (nothing to contain).
 */
export interface FileNotContainsRule extends BaseRule {
  readonly check: 'file-not-contains';
  readonly file: string;
  readonly pattern: RegExp;
}

/**
 * Checks that a JSON file contains a key at the given dot-notation path.
 * Note: keys containing dots are not supported in the path.
 */
export interface JsonHasKeyRule extends BaseRule {
  readonly check: 'json-has-key';
  readonly file: string;
  readonly key: string;
}

/**
 * Checks that a JSON file key at the given dot-notation path equals a specific value.
 * Uses strict equality (===) for comparison.
 */
export interface JsonKeyEqualsRule extends BaseRule {
  readonly check: 'json-key-equals';
  readonly file: string;
  readonly key: string;
  readonly value: unknown;
}

/**
 * Runs a custom validation function for checks that don't fit the built-in types.
 */
export interface CustomRule extends BaseRule {
  readonly check: 'custom';
  readonly validate: (scriptPath: string) => Promise<RuleResult>;
}

/**
 * Discriminated union of all supported scaffold rule types.
 *
 * To add a new rule type:
 * 1. Define a new interface extending BaseRule with a unique `check` literal
 * 2. Add it to this union
 * 3. Handle the new case in ScaffoldEngine.runRule()
 */
export type ScaffoldRule =
  | FileExistsRule
  | FileContainsRule
  | FileNotContainsRule
  | JsonHasKeyRule
  | JsonKeyEqualsRule
  | CustomRule;
