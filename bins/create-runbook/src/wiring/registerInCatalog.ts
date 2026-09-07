import * as fs from 'node:fs/promises';

import { formatTypeScript } from '../generate/formatTypeScript.js';
import type { RunbookProduct } from '../templates/RunbookProduct.js';

/** Data required to register a runbook in the automatic catalog. */
export interface RunbookRegistration {
  /** Stable automatic runbook key, also the directory name. */
  readonly id: string;
  /** Name of the constant exported by `registration.ts`. */
  readonly constName: string;
  /** Watchtower product owning the alarms; selects the downstream catalog. */
  readonly product: RunbookProduct;
  /** Automatic runbook family. */
  readonly kind: 'APIGW' | 'LAMBDA' | 'SERVICE';
  /** Non-empty categories exposed by the Watchtower catalog. */
  readonly categories: readonly [string, ...string[]];
}

/** Result of applying a registration to a source string. */
export interface RegistrationResult {
  /** The resulting source (unchanged when already registered). */
  readonly content: string;
  /** Whether the source was modified. */
  readonly changed: boolean;
}

/** Matches the existing registration imports, capturing the constant and the runbook id. */
const MANIFEST_IMPORT_RE = /^import \{ (\w+) \} from '\.\/runbooks\/([^']+)\/registration\.js';$/gmu;

/** Anchor used to locate the manifest array. */
const MANIFEST_ANCHOR = 'export const CATALOG_MANIFEST: ReadonlyArray<AutomaticRunbookRegistration> = [';

/**
 * Renders `runbooks/<id>/registration.ts`: the catalog identity of a runbook,
 * declared next to the runbook itself.
 *
 * @param registration - Runbook to describe
 * @returns The TypeScript source of the registration file
 */
export function renderRegistrationFile(registration: RunbookRegistration): string {
  const categories = registration.categories.map((category) => `'${category}'`).join(', ');
  return [
    `import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';`,
    '',
    `import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';`,
    `import { RunbookProducts } from '../../../types/RunbookProduct.js';`,
    `import { buildRunbook } from './runbook.js';`,
    '',
    `const KEY = '${registration.id}';`,
    '',
    `export const ${registration.constName}: AutomaticRunbookRegistration = {`,
    '  key: KEY,',
    `  product: RunbookProducts.${registration.product},`,
    `  kind: AutomaticRunbookKinds.${registration.kind},`,
    `  categories: [${categories}],`,
    '  alarmNames: [KEY],',
    '  build: buildRunbook,',
    '};',
    '',
  ].join('\n');
}

function insertRegistrationImport(source: string, registration: RunbookRegistration): string {
  let lastImportEnd = -1;
  for (const match of source.matchAll(MANIFEST_IMPORT_RE)) {
    const index = match.index;
    const fullMatch = match[0];
    if (index !== undefined && fullMatch !== undefined) {
      lastImportEnd = index + fullMatch.length;
    }
  }
  if (lastImportEnd === -1) {
    throw new Error('Impossibile trovare il blocco di import delle registrazioni nel manifest.');
  }
  const importLine = `import { ${registration.constName} } from './runbooks/${registration.id}/registration.js';`;
  return `${source.slice(0, lastImportEnd)}\n${importLine}${source.slice(lastImportEnd)}`;
}

/** Index just past the last entry of the `CATALOG_MANIFEST` array. */
function manifestArrayEnd(source: string): number {
  const anchorIndex = source.indexOf(MANIFEST_ANCHOR);
  if (anchorIndex === -1) {
    throw new Error('Impossibile trovare CATALOG_MANIFEST nel manifest.');
  }
  const closeIndex = source.indexOf('];', anchorIndex);
  if (closeIndex === -1) {
    throw new Error('Impossibile trovare la chiusura di CATALOG_MANIFEST nel manifest.');
  }
  return closeIndex;
}

function insertManifestEntry(source: string, registration: RunbookRegistration): string {
  const closeIndex = manifestArrayEnd(source);
  return `${source.slice(0, closeIndex)}  ${registration.constName},\n${source.slice(closeIndex)}`;
}

/**
 * Runbook id the manifest imports `constName` from, or `undefined` when the
 * constant is not imported at all.
 */
function importedFromRunbook(source: string, constName: string): string | undefined {
  for (const match of source.matchAll(MANIFEST_IMPORT_RE)) {
    if (match[1] === constName) return match[2];
  }
  return undefined;
}

/** Whether `constName` is already listed as an entry of the manifest array. */
function hasManifestEntry(source: string, constName: string): boolean {
  const anchorIndex = source.indexOf(MANIFEST_ANCHOR);
  const body = source.slice(anchorIndex + MANIFEST_ANCHOR.length, manifestArrayEnd(source));
  return body.split('\n').some((line) => line.trim() === `${constName},`);
}

/**
 * Inserts the import and the array entry for a new runbook into the catalog manifest.
 *
 * Idempotent per runbook: re-registering the same id returns the source
 * unchanged, and a manifest left half-wired gains only the missing half.
 *
 * The import is matched on the runbook it comes from, not on the constant name
 * appearing anywhere in the file: a substring test reported
 * `ONBOARDING_CONSUMER_REGISTRATION` as already registered because
 * `SELFCARE_ONBOARDING_CONSUMER_REGISTRATION` was, so the runbook's
 * `registration.ts` was written but never reached the manifest — and the
 * scaffolder said "runbook già registrato", which reads like success.
 *
 * @param source - Current catalog manifest source
 * @param registration - Runbook to register
 * @returns The (possibly) updated content and whether it changed
 * @throws When another runbook already exports a constant with the same name,
 *         which would not compile: the manifest imports them into one scope
 */
export function applyManifestRegistration(source: string, registration: RunbookRegistration): RegistrationResult {
  const importedFrom = importedFromRunbook(source, registration.constName);
  if (importedFrom !== undefined && importedFrom !== registration.id) {
    throw new Error(
      `Il manifest importa già ${registration.constName} da runbooks/${importedFrom}. ` +
        `Rinomina la costante esportata da runbooks/${registration.id}/registration.ts.`,
    );
  }

  const needsImport = importedFrom === undefined;
  const needsEntry = !hasManifestEntry(source, registration.constName);
  if (!needsImport && !needsEntry) {
    return { content: source, changed: false };
  }

  let content = source;
  if (needsImport) content = insertRegistrationImport(content, registration);
  if (needsEntry) content = insertManifestEntry(content, registration);
  return { content, changed: true };
}

/**
 * Registers a runbook in the catalog manifest on disk: reads the file,
 * applies {@link applyManifestRegistration}, formats, and writes it back.
 *
 * @param manifestFilePath - Absolute path to the catalog manifest source
 * @param registration - Runbook to register
 * @returns `true` when the file was modified, `false` when already registered
 */
export async function registerRunbookInCatalog(
  manifestFilePath: string,
  registration: RunbookRegistration,
): Promise<boolean> {
  const source = await fs.readFile(manifestFilePath, 'utf8');
  const result = applyManifestRegistration(source, registration);
  if (!result.changed) {
    return false;
  }
  const formatted = await formatTypeScript(result.content, manifestFilePath);
  await fs.writeFile(manifestFilePath, formatted, 'utf8');
  return true;
}
