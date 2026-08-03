import * as fs from 'node:fs/promises';

import { formatTypeScript } from '../generate/formatTypeScript.js';

/** Data required to register a runbook in the automatic catalog. */
export interface RunbookRegistration {
  /** Stable automatic runbook key. */
  readonly id: string;
  /** Builder function name to import and reference. */
  readonly builderName: string;
  /** Import specifier relative to runbookRegistry.ts. */
  readonly importPath: string;
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

/** Matches the existing concrete runbook builder imports. */
const RUNBOOK_IMPORT_RE = /^import \{ build\w+Runbook \} from '\.\/runbooks\/[^']+\/runbook\.js';$/gm;

/** Anchor used to locate the registry declaration. */
const REGISTRY_ANCHOR = 'const REGISTRATIONS: ReadonlyArray<AutomaticRunbookRegistration> = [';

function insertRunbookImport(source: string, registration: RunbookRegistration): string {
  let lastImportEnd = -1;
  for (const match of source.matchAll(RUNBOOK_IMPORT_RE)) {
    const index = match.index;
    const fullMatch = match[0];
    if (index !== undefined && fullMatch !== undefined) {
      lastImportEnd = index + fullMatch.length;
    }
  }
  if (lastImportEnd === -1) {
    throw new Error('Impossibile trovare il blocco di import dei runbook nel catalogo.');
  }
  const importLine = `import { ${registration.builderName} } from '${registration.importPath}';`;
  return `${source.slice(0, lastImportEnd)}\n${importLine}${source.slice(lastImportEnd)}`;
}

function insertRegistryEntry(source: string, registration: RunbookRegistration): string {
  const anchorIndex = source.indexOf(REGISTRY_ANCHOR);
  if (anchorIndex === -1) {
    throw new Error('Impossibile trovare REGISTRATIONS nel catalogo.');
  }
  const closeIndex = source.indexOf('];', anchorIndex);
  if (closeIndex === -1) {
    throw new Error('Impossibile trovare la chiusura di REGISTRATIONS nel catalogo.');
  }
  const categories = JSON.stringify(registration.categories);
  const entryLine = `  registration('${registration.id}', '${registration.kind}', ${categories}, ${registration.builderName}),\n`;
  return `${source.slice(0, closeIndex)}${entryLine}${source.slice(closeIndex)}`;
}

/**
 * Inserts the import and registration for a new runbook into the catalog.
 *
 * Idempotent: when the builder is already referenced, the source is
 * returned unchanged.
 *
 * @param source - Current runbook registry source
 * @param registration - Runbook to register
 * @returns The (possibly) updated content and whether it changed
 */
export function applyRunbookRegistration(source: string, registration: RunbookRegistration): RegistrationResult {
  if (source.includes(registration.builderName)) {
    return { content: source, changed: false };
  }
  const withImport = insertRunbookImport(source, registration);
  const withEntry = insertRegistryEntry(withImport, registration);
  return { content: withEntry, changed: true };
}

/**
 * Registers a runbook in the catalog on disk: reads the file,
 * applies {@link applyRunbookRegistration}, formats, and writes it back.
 *
 * @param registryFilePath - Absolute path to the catalog registry source
 * @param registration - Runbook to register
 * @returns `true` when the file was modified, `false` when already registered
 */
export async function registerRunbookInCatalog(
  registryFilePath: string,
  registration: RunbookRegistration,
): Promise<boolean> {
  const source = await fs.readFile(registryFilePath, 'utf8');
  const result = applyRunbookRegistration(source, registration);
  if (!result.changed) {
    return false;
  }
  const formatted = await formatTypeScript(result.content, registryFilePath);
  await fs.writeFile(registryFilePath, formatted, 'utf8');
  return true;
}
