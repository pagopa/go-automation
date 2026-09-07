import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the monorepo root (bins/create-runbook/src → repo root). */
export const REPO_ROOT = path.resolve(currentDir, '..', '..', '..');

/** Root directory holding the runbook template folders. */
export const TEMPLATES_ROOT = path.join(REPO_ROOT, 'bins', 'runbook-templates');

/** Directory under go-runbook where concrete automatic runbooks live. */
export const RUNBOOKS_DIR = path.join(REPO_ROOT, 'packages', 'go-runbook', 'src', 'catalog', 'runbooks');

/** Hand-maintained source file that lists every automatic runbook. */
export const CATALOG_MANIFEST_FILE = path.join(
  REPO_ROOT,
  'packages',
  'go-runbook',
  'src',
  'catalog',
  'catalogManifest.ts',
);
