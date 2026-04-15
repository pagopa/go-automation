/**
 * Scaffold Validator - Entry Point
 *
 * Discovers all script directories in the monorepo workspace,
 * validates each against the scaffold rules, and exits with
 * code 1 if any rule fails (suitable for CI pipelines).
 * Warnings are reported but do not cause a non-zero exit code.
 *
 * Usage:
 *   pnpm validate:scaffold            # normal output (failures only per script)
 *   pnpm validate:scaffold --verbose   # show all checks including passed ones
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { ScaffoldEngine } from './ScaffoldEngine.js';
import { functionRules } from './functionRules.js';
import { monorepoRules } from './monorepoRules.js';
import { scaffoldRules } from './rules.js';

// ── ANSI helpers ──────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const PASS = `${GREEN}[PASS]${RESET}`;
const FAIL = `${RED}[FAIL]${RESET}`;
const WARN = `${YELLOW}[WARN]${RESET}`;

/** Whether we are running inside GitHub Actions */
const IS_GITHUB_ACTIONS = process.env['GITHUB_ACTIONS'] === 'true';

// ── Workspace discovery ───────────────────────────────────────────────

const SCRIPT_DIRS = ['scripts/go', 'scripts/send', 'scripts/interop'] as const;
const FUNCTION_DIRS = ['functions'] as const;

interface ValidationTargetGroup {
  readonly label: string;
  readonly countLabel: string;
  readonly paths: ReadonlyArray<string>;
  readonly engine: ScaffoldEngine;
}

/**
 * Finds all package directories one level under the provided parent folders.
 */
async function discoverWorkspacePackages(
  rootDir: string,
  parentDirs: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
  const packages: string[] = [];

  for (const dir of parentDirs) {
    const fullDir = path.join(rootDir, dir);
    try {
      const entries = await fs.readdir(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          packages.push(path.join(fullDir, entry.name));
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  return packages.sort();
}

async function validateGroup(
  rootDir: string,
  group: ValidationTargetGroup,
): Promise<{ checks: number; errors: number; warnings: number }> {
  if (group.paths.length === 0) {
    return { checks: 0, errors: 0, warnings: 0 };
  }

  console.log(`\n${BOLD}${group.label}${RESET}`);

  let totalChecks = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const targetPath of group.paths) {
    const name = path.relative(rootDir, targetPath) || '.';
    const results = await group.engine.validate(targetPath);
    const errors = results.filter((r) => !r.passed && r.severity === 'error');
    const warnings = results.filter((r) => !r.passed && r.severity === 'warning');
    const issues = errors.length + warnings.length;

    totalChecks += results.length;
    totalErrors += errors.length;
    totalWarnings += warnings.length;

    if (issues === 0) {
      console.log(
        `\n  ${PASS} ${BOLD}${name}${RESET} ${DIM}(${String(results.length)}/${String(results.length)})${RESET}`,
      );
    } else {
      const passed = results.length - issues;
      const label = errors.length > 0 ? FAIL : WARN;
      console.log(`\n  ${label} ${BOLD}${name}${RESET} ${DIM}(${String(passed)}/${String(results.length)})${RESET}`);
    }

    for (const result of results) {
      if (result.passed) {
        continue;
      }

      const tag = result.severity === 'warning' ? WARN : FAIL;
      console.log(`    ${tag} ${result.rule}`);
      if (result.message) {
        console.log(`         ${DIM}${result.message}${RESET}`);
      }
      if (IS_GITHUB_ACTIONS) {
        const level = result.severity === 'warning' ? 'warning' : 'error';
        const filePart = result.file ? `file=${name}/${result.file},` : '';
        const linePart = result.line !== undefined ? `line=${String(result.line)},` : '';
        const body = result.message ?? result.rule;
        console.log(`::${level} ${filePart}${linePart}title=${result.rule}::${body}`);
      }
    }
  }

  return {
    checks: totalChecks,
    errors: totalErrors,
    warnings: totalWarnings,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const scripts = await discoverWorkspacePackages(rootDir, SCRIPT_DIRS);
  const functions = await discoverWorkspacePackages(rootDir, FUNCTION_DIRS);

  const groups: ReadonlyArray<ValidationTargetGroup> = [
    {
      label: 'Monorepo',
      countLabel: 'monorepo',
      paths: [rootDir],
      engine: new ScaffoldEngine(monorepoRules),
    },
    {
      label: 'Scripts',
      countLabel: 'scripts',
      paths: scripts,
      engine: new ScaffoldEngine(scaffoldRules),
    },
    {
      label: 'Functions',
      countLabel: 'functions',
      paths: functions,
      engine: new ScaffoldEngine(functionRules),
    },
  ];

  console.log(`\n${BOLD}Scaffold Validation${RESET}`);
  console.log('='.repeat(50));

  let totalChecks = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const group of groups) {
    const totals = await validateGroup(rootDir, group);
    totalChecks += totals.checks;
    totalErrors += totals.errors;
    totalWarnings += totals.warnings;
  }

  console.log(`\n${'='.repeat(50)}`);

  const parts: string[] = [];

  for (const group of groups) {
    if (group.paths.length > 1) {
      parts.push(`${BOLD}${String(group.paths.length)} ${group.countLabel}${RESET}`);
    }
  }

  parts.push(`${String(totalChecks)} checks`);

  if (totalErrors > 0) {
    parts.push(`${RED}${String(totalErrors)} error${totalErrors > 1 ? 's' : ''}${RESET}`);
  }
  if (totalWarnings > 0) {
    parts.push(`${YELLOW}${String(totalWarnings)} warning${totalWarnings > 1 ? 's' : ''}${RESET}`);
  }
  if (totalErrors === 0 && totalWarnings === 0) {
    parts.push(`${GREEN}all passed${RESET}`);
  }

  console.log(`${parts.join(', ')}\n`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('Validation error:', error);
  process.exit(1);
});
