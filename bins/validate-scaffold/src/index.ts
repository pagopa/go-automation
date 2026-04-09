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

// ── Script discovery ──────────────────────────────────────────────────

const SCRIPT_DIRS = ['scripts/go', 'scripts/send', 'scripts/interop'] as const;

/**
 * Finds all script directories under the workspace script folders.
 */
async function discoverScripts(rootDir: string): Promise<ReadonlyArray<string>> {
  const scripts: string[] = [];

  for (const dir of SCRIPT_DIRS) {
    const fullDir = path.join(rootDir, dir);
    try {
      const entries = await fs.readdir(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scripts.push(path.join(fullDir, entry.name));
        }
      }
    } catch {
      // Directory doesn't exist yet (e.g. interop/)
    }
  }

  return scripts.sort();
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const rootDir = process.cwd();
  const scripts = await discoverScripts(rootDir);
  const engine = new ScaffoldEngine(scaffoldRules);

  console.log(`\n${BOLD}Scaffold Validation${RESET}`);
  console.log('='.repeat(50));

  let totalChecks = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const scriptPath of scripts) {
    const name = path.relative(rootDir, scriptPath);
    const results = await engine.validate(scriptPath);
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
      if (verbose) {
        for (const result of results) {
          console.log(`    ${DIM}${result.rule}${RESET}`);
        }
      }
    } else {
      const passed = results.length - issues;
      const label = errors.length > 0 ? FAIL : WARN;
      console.log(`\n  ${label} ${BOLD}${name}${RESET} ${DIM}(${String(passed)}/${String(results.length)})${RESET}`);
      for (const result of results) {
        if (result.passed) {
          if (verbose) {
            console.log(`    ${DIM}${result.rule}${RESET}`);
          }
        } else {
          const tag = result.severity === 'warning' ? WARN : FAIL;
          console.log(`    ${tag} ${result.rule}`);
          if (result.message) {
            console.log(`         ${DIM}${result.message}${RESET}`);
          }
        }
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);

  const parts: string[] = [`${BOLD}${String(scripts.length)} scripts${RESET}`, `${String(totalChecks)} checks`];

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
