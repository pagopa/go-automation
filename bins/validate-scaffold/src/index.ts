/**
 * Scaffold Validator - Entry Point
 *
 * Discovers all script directories in the monorepo workspace,
 * validates each against the scaffold rules, and exits with
 * code 1 if any rule fails (suitable for CI pipelines).
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
const RESET = '\x1b[0m';

const PASS = `${GREEN}[PASS]${RESET}`;
const FAIL = `${RED}[FAIL]${RESET}`;

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
  let totalFailures = 0;

  for (const scriptPath of scripts) {
    const name = path.relative(rootDir, scriptPath);
    const results = await engine.validate(scriptPath);
    const failures = results.filter((r) => !r.passed);

    totalChecks += results.length;
    totalFailures += failures.length;

    if (failures.length === 0) {
      console.log(
        `\n  ${PASS} ${BOLD}${name}${RESET} ${DIM}(${String(results.length)}/${String(results.length)})${RESET}`,
      );
      if (verbose) {
        for (const result of results) {
          console.log(`    ${DIM}${result.rule}${RESET}`);
        }
      }
    } else {
      const passed = results.length - failures.length;
      console.log(`\n  ${FAIL} ${BOLD}${name}${RESET} ${DIM}(${String(passed)}/${String(results.length)})${RESET}`);
      for (const result of results) {
        if (result.passed) {
          if (verbose) {
            console.log(`    ${DIM}${result.rule}${RESET}`);
          }
        } else {
          console.log(`    ${FAIL} ${result.rule}`);
          if (result.message) {
            console.log(`         ${DIM}${result.message}${RESET}`);
          }
        }
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);

  const failureText =
    totalFailures === 0
      ? `${GREEN}0 failures${RESET}`
      : `${RED}${String(totalFailures)} failure${totalFailures > 1 ? 's' : ''}${RESET}`;

  console.log(`${BOLD}${String(scripts.length)} scripts${RESET}, ${String(totalChecks)} checks, ${failureText}\n`);

  if (totalFailures > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('Validation error:', error);
  process.exit(1);
});
