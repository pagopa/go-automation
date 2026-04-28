/**
 * Monorepo-Level Validation Rules
 *
 * These rules validate the consistency of root-level configuration files
 * against the actual workspace directories. Unlike script/function rules
 * that validate individual workspaces, these rules check that the monorepo
 * root stays in sync as workspaces are added or removed.
 */

import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';

import { discoverWorkspacePackages, toWorkspaceRelativePath } from './workspaceDiscovery.js';
import type { ScaffoldRule } from './types/index.js';

export interface MonorepoRulesContext {
  readonly workspaceParents: ReadonlyArray<string>;
  readonly excludeRelativePaths: ReadonlyArray<string>;
}

/**
 * Discovers all workspace directories by scanning one level under configured parents.
 * Returns relative paths like "packages/go-common", "scripts/go/go-report-alarms".
 */
async function discoverWorkspaceDirs(rootDir: string, context: MonorepoRulesContext): Promise<ReadonlyArray<string>> {
  const paths = await discoverWorkspacePackages(rootDir, context.workspaceParents, context.excludeRelativePaths);
  return paths.map((targetPath) => toWorkspaceRelativePath(rootDir, targetPath)).sort();
}

/**
 * Reads root tsconfig.json and returns the set of referenced paths (normalized, without leading ./)
 */
async function readTsconfigReferences(rootDir: string): Promise<ReadonlyArray<string>> {
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  const content = await fs.readFile(tsconfigPath, 'utf-8');
  const tsconfig = JSON.parse(content) as Record<string, unknown>;
  const references = tsconfig['references'] as ReadonlyArray<{ readonly path: string }> | undefined;

  if (!references) {
    return [];
  }

  return references.map((ref) => ref.path.replace(/^\.\//, ''));
}

export function createMonorepoRules(context: MonorepoRulesContext): ReadonlyArray<ScaffoldRule> {
  return [
    // ── tsconfig.json root sync ────────────────────────────────────────

    {
      name: 'Root tsconfig.json references all workspaces',
      check: 'custom',
      validate: async (rootDir) => {
        const ruleName = 'Root tsconfig.json references all workspaces';

        let referencedPaths: ReadonlyArray<string>;
        try {
          referencedPaths = await readTsconfigReferences(rootDir);
        } catch {
          return { rule: ruleName, passed: false, file: 'tsconfig.json', message: 'Cannot read root tsconfig.json' };
        }

        const refSet = new Set(referencedPaths);
        const workspaceDirs = await discoverWorkspaceDirs(rootDir, context);

        const missing: string[] = [];
        for (const dir of workspaceDirs) {
          if (!refSet.has(dir)) {
            missing.push(dir);
          }
        }

        if (missing.length > 0) {
          return {
            rule: ruleName,
            passed: false,
            file: 'tsconfig.json',
            message: `Missing references: ${missing.join(', ')}`,
          };
        }

        return { rule: ruleName, passed: true };
      },
    },

    {
      name: 'Root tsconfig.json has no stale references',
      check: 'custom',
      validate: async (rootDir) => {
        const ruleName = 'Root tsconfig.json has no stale references';

        let referencedPaths: ReadonlyArray<string>;
        try {
          referencedPaths = await readTsconfigReferences(rootDir);
        } catch {
          return { rule: ruleName, passed: false, file: 'tsconfig.json', message: 'Cannot read root tsconfig.json' };
        }

        const stale: string[] = [];
        for (const refPath of referencedPaths) {
          const fullPath = path.join(rootDir, refPath);
          try {
            await fs.access(fullPath);
          } catch {
            stale.push(refPath);
          }
        }

        if (stale.length > 0) {
          return {
            rule: ruleName,
            passed: false,
            file: 'tsconfig.json',
            message: `Stale references (directory not found): ${stale.join(', ')}`,
          };
        }

        return { rule: ruleName, passed: true };
      },
    },

    {
      name: 'Root tsconfig.json references are sorted',
      severity: 'warning',
      check: 'custom',
      validate: async (rootDir) => {
        const ruleName = 'Root tsconfig.json references are sorted';

        let referencedPaths: ReadonlyArray<string>;
        try {
          referencedPaths = await readTsconfigReferences(rootDir);
        } catch {
          return { rule: ruleName, passed: false, file: 'tsconfig.json', message: 'Cannot read root tsconfig.json' };
        }

        const sorted = [...referencedPaths].sort();
        const isOrdered = referencedPaths.every((p, i) => p === sorted[i]);

        if (!isOrdered) {
          return {
            rule: ruleName,
            passed: false,
            file: 'tsconfig.json',
            message: 'References should be sorted alphabetically',
          };
        }

        return { rule: ruleName, passed: true };
      },
    },

    // ── knip.config.ts sync ────────────────────────────────────────────

    {
      name: 'knip.config.ts lists all packages',
      check: 'custom',
      validate: async (rootDir) => {
        const ruleName = 'knip.config.ts lists all packages';
        const knipPath = path.join(rootDir, 'knip.config.ts');

        let content: string;
        try {
          content = await fs.readFile(knipPath, 'utf-8');
        } catch {
          return { rule: ruleName, passed: false, file: 'knip.config.ts', message: 'knip.config.ts not found' };
        }

        const packagesDir = path.join(rootDir, 'packages');
        let entries: Dirent[];
        try {
          entries = await fs.readdir(packagesDir, { withFileTypes: true });
        } catch {
          return { rule: ruleName, passed: true };
        }

        const missing: string[] = [];

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const knipKey = `packages/${entry.name}`;
            if (!content.includes(`'${knipKey}'`)) {
              missing.push(knipKey);
            }
          }
        }

        if (missing.length > 0) {
          return {
            rule: ruleName,
            passed: false,
            file: 'knip.config.ts',
            message: `Missing workspace entries: ${missing.join(', ')}`,
          };
        }

        return { rule: ruleName, passed: true };
      },
    },
  ];
}
