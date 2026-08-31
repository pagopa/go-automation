import * as fs from 'node:fs/promises';

import { formatTypeScript } from '../generate/formatTypeScript.js';
import type { RunbookProduct } from '../templates/RunbookProduct.js';

/** Data required to register a runbook in the automatic catalog. */
export interface RunbookRegistration {
  /** Stable automatic runbook key, also the directory name. */
  readonly id: string;
  /** Builder function name to import and reference. */
  readonly builderName: string;
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

/** Matches the existing registration imports of the manifest. */
const MANIFEST_IMPORT_RE = /^import \{ \w+ \} from '\.\/runbooks\/[^']+\/registration\.js';$/gmu;

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
    `import { ${registration.builderName} } from './runbook.js';`,
    '',
    `const KEY = '${registration.id}';`,
    '',
    `export const ${registration.constName}: AutomaticRunbookRegistration = {`,
    '  key: KEY,',
    `  product: RunbookProducts.${registration.product},`,
    `  kind: AutomaticRunbookKinds.${registration.kind},`,
    `  categories: [${categories}],`,
    '  alarmNames: [KEY],',
    `  build: ${registration.builderName},`,
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

function insertManifestEntry(source: string, registration: RunbookRegistration): string {
  const anchorIndex = source.indexOf(MANIFEST_ANCHOR);
  if (anchorIndex === -1) {
    throw new Error('Impossibile trovare CATALOG_MANIFEST nel manifest.');
  }
  const closeIndex = source.indexOf('];', anchorIndex);
  if (closeIndex === -1) {
    throw new Error('Impossibile trovare la chiusura di CATALOG_MANIFEST nel manifest.');
  }
  return `${source.slice(0, closeIndex)}  ${registration.constName},\n${source.slice(closeIndex)}`;
}

/**
 * Inserts the import and the array entry for a new runbook into the catalog manifest.
 *
 * Idempotent: when the registration constant is already referenced, the source is
 * returned unchanged.
 *
 * @param source - Current catalog manifest source
 * @param registration - Runbook to register
 * @returns The (possibly) updated content and whether it changed
 */
export function applyManifestRegistration(source: string, registration: RunbookRegistration): RegistrationResult {
  if (source.includes(registration.constName)) {
    return { content: source, changed: false };
  }
  const withImport = insertRegistrationImport(source, registration);
  const withEntry = insertManifestEntry(withImport, registration);
  return { content: withEntry, changed: true };
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
