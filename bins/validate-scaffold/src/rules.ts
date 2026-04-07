/**
 * Scaffold Validation Rules
 *
 * This file defines all the rules that every script in the monorepo must satisfy.
 * To add a new rule, append an entry to the array below.
 *
 * Available check types:
 *   - file-exists        → at least one file matches the glob
 *   - file-contains      → file content matches the RegExp
 *   - file-not-contains  → file content does NOT match the RegExp
 *   - json-has-key       → JSON file has a key at dot-notation path
 *   - json-key-equals    → JSON file key equals a specific value
 *   - custom             → async function returning { rule, passed, message? }
 */

import type { ScaffoldRule } from './types/index.js';

export const scaffoldRules: ReadonlyArray<ScaffoldRule> = [
  // ── Types folder structure ──────────────────────────────────────────

  {
    name: 'Config type file exists in types/',
    check: 'file-exists',
    glob: 'src/types/*Config.ts',
  },
  {
    name: 'Barrel file types/index.ts exists',
    check: 'file-exists',
    glob: 'src/types/index.ts',
  },

  // ── config.ts cleanliness ───────────────────────────────────────────

  {
    name: 'config.ts does not define interfaces',
    check: 'file-not-contains',
    file: 'src/config.ts',
    pattern: /^export interface/m,
  },
  {
    name: 'config.ts does not re-export config types',
    check: 'file-not-contains',
    file: 'src/config.ts',
    pattern: /^export type \{.*Config/m,
  },

  // ── main.ts imports ─────────────────────────────────────────────────

  {
    name: 'main.ts imports config type from types/, not config.ts',
    check: 'file-not-contains',
    file: 'src/main.ts',
    pattern: /import.*Config.*from '\.\/config\.js'/,
  },

  // ── package.json scripts ────────────────────────────────────────────

  {
    name: 'package.json has "build" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.build',
  },
  {
    name: 'package.json has "start" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.start',
  },
  {
    name: 'package.json has "dev" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.dev',
  },
  {
    name: 'package.json has "clean" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.clean',
  },

  // ── tsconfig.json ───────────────────────────────────────────────────

  {
    name: 'tsconfig.json exists',
    check: 'file-exists',
    glob: 'tsconfig.json',
  },
  {
    name: 'tsconfig.json extends base config',
    check: 'file-contains',
    file: 'tsconfig.json',
    pattern: /tsconfig\.base\.json/,
  },
  {
    name: 'tsconfig.json references go-common',
    check: 'file-contains',
    file: 'tsconfig.json',
    pattern: /go-common/,
  },

  // ── go-common dependency ────────────────────────────────────────────

  {
    name: 'package.json depends on @go-automation/go-common',
    check: 'json-has-key',
    file: 'package.json',
    key: 'dependencies.@go-automation/go-common',
  },
];
