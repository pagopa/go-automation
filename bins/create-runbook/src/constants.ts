import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the monorepo root (bins/create-runbook/src → repo root). */
export const REPO_ROOT = path.resolve(currentDir, '..', '..', '..');

/** Root directory holding the runbook template folders. */
export const TEMPLATES_ROOT = path.join(REPO_ROOT, 'bins', 'runbook-templates');

/** Directory under go-runbook where concrete automatic runbooks live. */
export const RUNBOOKS_DIR = path.join(REPO_ROOT, 'packages', 'go-runbook', 'src', 'catalog', 'runbooks');

/** Source file that holds the automatic runbook registry. */
export const RUNBOOK_REGISTRY_FILE = path.join(
  REPO_ROOT,
  'packages',
  'go-runbook',
  'src',
  'catalog',
  'runbookRegistry.ts',
);
