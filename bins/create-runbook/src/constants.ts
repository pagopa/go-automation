import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the monorepo root (bins/create-runbook/src → repo root). */
export const REPO_ROOT = path.resolve(currentDir, '..', '..', '..');

/** Root directory holding the runbook template folders. */
export const TEMPLATES_ROOT = path.join(REPO_ROOT, 'bins', 'runbook-templates');

/** Directory under go-analyze-alarm where runbook folders live. */
export const RUNBOOKS_DIR = path.join(REPO_ROOT, 'scripts', 'go', 'go-analyze-alarm', 'src', 'libs', 'runbooks');

/** The go-analyze-alarm entry point that holds the runbook registry. */
export const ANALYZER_MAIN_FILE = path.join(REPO_ROOT, 'scripts', 'go', 'go-analyze-alarm', 'src', 'main.ts');
