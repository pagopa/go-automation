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

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

export interface MonorepoRulesContext {
  readonly workspaceParents: ReadonlyArray<string>;
  readonly excludeRelativePaths: ReadonlyArray<string>;
}

interface PackageJson {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

interface PackageJsonReadResult {
  readonly content: string;
  readonly packageJson: PackageJson;
}

interface DependencyCatalogViolation {
  readonly packageJsonFile: string;
  readonly section: (typeof DEPENDENCY_SECTIONS)[number];
  readonly dependencyName: string;
  readonly spec: string;
  readonly line?: number;
}

interface PackageJsonReadViolation {
  readonly packageJsonFile: string;
  readonly reason: string;
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

function isAllowedDependencySpec(spec: string): boolean {
  return spec.startsWith('catalog:') || spec.startsWith('workspace:');
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJsonReadResult> {
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  return {
    content,
    packageJson: JSON.parse(content) as PackageJson,
  };
}

async function findWorkspacePackageJsonFiles(
  rootDir: string,
  context: MonorepoRulesContext,
): Promise<ReadonlyArray<string>> {
  const workspaceDirs = await discoverWorkspaceDirs(rootDir, context);
  return ['package.json', ...workspaceDirs.map((dir) => `${dir}/package.json`)];
}

function findDependencyLine(
  content: string,
  section: (typeof DEPENDENCY_SECTIONS)[number],
  dependencyName: string,
): number | undefined {
  const lines = content.split('\n');
  const sectionPattern = new RegExp(`^\\s*"${section}"\\s*:\\s*\\{`);
  const dependencyPattern = new RegExp(`^\\s*"${dependencyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:`);
  let inSection = false;

  for (const [index, line] of lines.entries()) {
    if (!inSection && sectionPattern.test(line)) {
      inSection = true;
      continue;
    }

    if (!inSection) continue;

    if (/^\s*}/.test(line)) {
      return undefined;
    }

    if (dependencyPattern.test(line)) {
      return index + 1;
    }
  }

  return undefined;
}

function formatDependencyCatalogViolation(violation: DependencyCatalogViolation): string {
  return `${violation.packageJsonFile} ${violation.section}.${violation.dependencyName} = ${violation.spec}`;
}

function formatPackageJsonReadViolation(violation: PackageJsonReadViolation): string {
  return `${violation.packageJsonFile}: ${violation.reason}`;
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
      name: 'package.json files are readable and valid',
      check: 'custom',
      validate: async (rootDir) => {
        const ruleName = 'package.json files are readable and valid';
        const packageJsonFiles = await findWorkspacePackageJsonFiles(rootDir, context);
        const violations: PackageJsonReadViolation[] = [];

        for (const relativePackageJson of packageJsonFiles) {
          try {
            await readPackageJson(path.join(rootDir, relativePackageJson));
          } catch (error: unknown) {
            violations.push({
              packageJsonFile: relativePackageJson,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (violations.length > 0) {
          return {
            rule: ruleName,
            passed: false,
            file: violations[0]?.packageJsonFile,
            message: [
              'Some package.json files could not be read or parsed.',
              ...violations.map((violation) => `- ${formatPackageJsonReadViolation(violation)}`),
            ].join('\n'),
          };
        }

        return { rule: ruleName, passed: true };
      },
    },

    {
      name: 'package.json dependencies use pnpm catalog',
      check: 'custom',
      validate: async (rootDir) => {
        const ruleName = 'package.json dependencies use pnpm catalog';
        const packageJsonFiles = await findWorkspacePackageJsonFiles(rootDir, context);
        const violations: DependencyCatalogViolation[] = [];

        for (const relativePackageJson of packageJsonFiles) {
          const packageJsonPath = path.join(rootDir, relativePackageJson);

          let packageJson: PackageJson;
          let content: string;
          try {
            const result = await readPackageJson(packageJsonPath);
            packageJson = result.packageJson;
            content = result.content;
          } catch {
            continue;
          }

          for (const section of DEPENDENCY_SECTIONS) {
            const dependencies = packageJson[section];
            if (dependencies === undefined) continue;

            for (const [dependencyName, spec] of Object.entries(dependencies)) {
              if (!isAllowedDependencySpec(spec)) {
                const line = findDependencyLine(content, section, dependencyName);
                violations.push({
                  packageJsonFile: relativePackageJson,
                  section,
                  dependencyName,
                  spec,
                  ...(line !== undefined && { line }),
                });
              }
            }
          }
        }

        if (violations.length > 0) {
          return {
            rule: ruleName,
            passed: false,
            file: violations[0]?.packageJsonFile,
            line: violations[0]?.line,
            message: [
              'Use catalog: for external dependencies and workspace: for internal dependencies.',
              ...violations.map((violation) => `- ${formatDependencyCatalogViolation(violation)}`),
            ].join('\n'),
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
