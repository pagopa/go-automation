import * as fs from 'node:fs/promises';

import type { RunbookKind } from '../../../../packages/go-runbook/src/toolkits/common/registration/RunbookKind.js';

import { formatTypeScript } from '../generate/formatTypeScript.js';
import { FAMILY_LABELS, manifestConstName } from '../inventoryLayout.js';
import type { RunbookProduct } from '../templates/RunbookProduct.js';

/** Data required to register a runbook in the automatic catalog. */
export interface RunbookRegistration {
  /** Stable automatic runbook key, also the directory name. */
  readonly id: string;
  /** Name of the constant exported by `registration.ts`. */
  readonly constName: string;
  /** Watchtower product owning the alarms; selects the manifest and the downstream catalog. */
  readonly product: RunbookProduct;
  /** Inventory family: the folder under `inventory/<product>/`. */
  readonly family: string;
  /** Automatic runbook family. */
  readonly kind: RunbookKind;
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

/**
 * Matches the registration imports of a product manifest
 * (`./<family>/<id>/registration.js`), capturing the constant, the family and the runbook id.
 */
const MANIFEST_IMPORT_RE = /^import \{ (\w+) \} from '\.\/([a-z0-9]+)\/([^']+)\/registration\.js';$/gmu;

/** Declaration of the manifest array of a product, used as anchor. */
function manifestAnchor(product: RunbookProduct): string {
  return `export const ${manifestConstName(product)}: ReadonlyArray<RunbookRegistration> = [`;
}

/** Comment that opens the block of a family, in the imports and in the array. */
function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family;
}

/**
 * Renders `inventory/<product>/<family>/<id>/registration.ts`: the catalog
 * identity of a runbook, declared next to the runbook itself. It imports the
 * registration API from the barrel of its product toolkit.
 *
 * @param registration - Runbook to describe
 * @returns The TypeScript source of the registration file
 */
export function renderRegistrationFile(registration: RunbookRegistration): string {
  const categories = registration.categories.map((category) => `'${category}'`).join(', ');
  const toolkit = registration.product === 'INTEROP' ? 'interop' : 'send';
  return [
    `import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/${toolkit}/index.js';`,
    '',
    `import { buildRunbook } from './runbook.js';`,
    '',
    `const KEY = '${registration.id}';`,
    '',
    `export const ${registration.constName}: RunbookRegistration = {`,
    '  key: KEY,',
    `  product: RunbookProducts.${registration.product},`,
    `  kind: RunbookKinds.${registration.kind},`,
    `  categories: [${categories}],`,
    '  alarmNames: [KEY],',
    '  build: buildRunbook,',
    '};',
    '',
  ].join('\n');
}

/** Inserts the import after the last import of the same family, or opens the family block after the last import. */
function insertRegistrationImport(source: string, registration: RunbookRegistration): string {
  let lastImportEnd = -1;
  let lastFamilyImportEnd = -1;
  for (const match of source.matchAll(MANIFEST_IMPORT_RE)) {
    const index = match.index;
    const fullMatch = match[0];
    if (index !== undefined && fullMatch !== undefined) {
      lastImportEnd = index + fullMatch.length;
      if (match[2] === registration.family) lastFamilyImportEnd = lastImportEnd;
    }
  }
  if (lastImportEnd === -1) {
    throw new Error('Impossibile trovare il blocco di import delle registrazioni nel manifest.');
  }
  const importLine = `import { ${registration.constName} } from './${registration.family}/${registration.id}/registration.js';`;
  if (lastFamilyImportEnd !== -1) {
    return `${source.slice(0, lastFamilyImportEnd)}\n${importLine}${source.slice(lastFamilyImportEnd)}`;
  }
  const block = `// ${familyLabel(registration.family)}\n${importLine}`;
  return `${source.slice(0, lastImportEnd)}\n${block}${source.slice(lastImportEnd)}`;
}

/** Index of the closing `];` of the product manifest array. */
function manifestArrayEnd(source: string, product: RunbookProduct): number {
  const anchorIndex = source.indexOf(manifestAnchor(product));
  if (anchorIndex === -1) {
    throw new Error(`Impossibile trovare ${manifestConstName(product)} nel manifest.`);
  }
  const closeIndex = source.indexOf('];', anchorIndex);
  if (closeIndex === -1) {
    throw new Error(`Impossibile trovare la chiusura di ${manifestConstName(product)} nel manifest.`);
  }
  return closeIndex;
}

/**
 * Inserts the array entry at the end of the block of its family (`  // <label>`),
 * or opens the block at the end of the array when the family has none yet.
 */
function insertManifestEntry(source: string, registration: RunbookRegistration): string {
  const closeIndex = manifestArrayEnd(source, registration.product);
  const anchorIndex = source.indexOf(manifestAnchor(registration.product));
  const blockComment = `  // ${familyLabel(registration.family)}\n`;
  const blockIndex = source.indexOf(blockComment, anchorIndex);
  const entry = `  ${registration.constName},\n`;
  if (blockIndex === -1 || blockIndex > closeIndex) {
    return `${source.slice(0, closeIndex)}${blockComment}${entry}${source.slice(closeIndex)}`;
  }
  const nextBlock = source.indexOf('  // ', blockIndex + blockComment.length);
  const insertAt = nextBlock !== -1 && nextBlock < closeIndex ? nextBlock : closeIndex;
  return `${source.slice(0, insertAt)}${entry}${source.slice(insertAt)}`;
}

/**
 * `<family>/<id>` the manifest imports `constName` from, or `undefined` when
 * the constant is not imported at all.
 */
function importedFromRunbook(source: string, constName: string): string | undefined {
  for (const match of source.matchAll(MANIFEST_IMPORT_RE)) {
    if (match[1] === constName && match[2] !== undefined && match[3] !== undefined) return `${match[2]}/${match[3]}`;
  }
  return undefined;
}

/** Whether the constant is already listed as an entry of the product manifest array. */
function hasManifestEntry(source: string, registration: RunbookRegistration): boolean {
  const anchor = manifestAnchor(registration.product);
  const anchorIndex = source.indexOf(anchor);
  const body = source.slice(anchorIndex + anchor.length, manifestArrayEnd(source, registration.product));
  return body.split('\n').some((line) => line.trim().replace(/\s*\/\/.*$/u, '') === `${registration.constName},`);
}

/**
 * Inserts the import and the array entry for a new runbook into its product manifest,
 * in the block of its family.
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
 * @param source - Current product manifest source
 * @param registration - Runbook to register
 * @returns The (possibly) updated content and whether it changed
 * @throws When another runbook already exports a constant with the same name,
 *         which would not compile: the manifest imports them into one scope
 */
export function applyManifestRegistration(source: string, registration: RunbookRegistration): RegistrationResult {
  const importedFrom = importedFromRunbook(source, registration.constName);
  const ownPath = `${registration.family}/${registration.id}`;
  if (importedFrom !== undefined && importedFrom !== ownPath) {
    throw new Error(
      `Il manifest importa già ${registration.constName} da ${importedFrom}. ` +
        `Rinomina la costante esportata da ${ownPath}/registration.ts.`,
    );
  }

  const needsImport = importedFrom === undefined;
  const needsEntry = !hasManifestEntry(source, registration);
  if (!needsImport && !needsEntry) {
    return { content: source, changed: false };
  }

  let content = source;
  if (needsImport) content = insertRegistrationImport(content, registration);
  if (needsEntry) content = insertManifestEntry(content, registration);
  return { content, changed: true };
}

/**
 * Registers a runbook in its product manifest on disk: reads the file,
 * applies {@link applyManifestRegistration}, formats, and writes it back.
 *
 * @param manifestFilePath - Absolute path to the product manifest (`inventory/<product>/manifest.ts`)
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
