import * as fs from 'node:fs/promises';

import { formatTypeScript } from '../generate/formatTypeScript.js';

/** Data required to register a runbook in the analyzer. */
export interface RunbookRegistration {
  /** Runbook id (RUNBOOK_REGISTRY key). */
  readonly id: string;
  /** Builder function name to import and reference. */
  readonly builderName: string;
  /** Import specifier relative to main.ts (e.g. `./libs/runbooks/<id>/runbook.js`). */
  readonly importPath: string;
}

/** Result of applying a registration to a source string. */
export interface RegistrationResult {
  /** The resulting source (unchanged when already registered). */
  readonly content: string;
  /** Whether the source was modified. */
  readonly changed: boolean;
}

/** Matches the existing runbook import lines in main.ts. */
const RUNBOOK_IMPORT_RE = /^import \{ build\w+Runbook \} from '\.\/libs\/runbooks\/[^']+\/runbook\.js';$/gm;

/** Anchor used to locate the registry declaration. */
const REGISTRY_ANCHOR = 'RUNBOOK_REGISTRY';

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
    throw new Error('Impossibile trovare il blocco di import dei runbook in main.ts.');
  }
  const importLine = `import { ${registration.builderName} } from '${registration.importPath}';`;
  return `${source.slice(0, lastImportEnd)}\n${importLine}${source.slice(lastImportEnd)}`;
}

function insertRegistryEntry(source: string, registration: RunbookRegistration): string {
  const anchorIndex = source.indexOf(REGISTRY_ANCHOR);
  if (anchorIndex === -1) {
    throw new Error('Impossibile trovare RUNBOOK_REGISTRY in main.ts.');
  }
  const closeIndex = source.indexOf(']);', anchorIndex);
  if (closeIndex === -1) {
    throw new Error('Impossibile trovare la chiusura di RUNBOOK_REGISTRY in main.ts.');
  }
  const entryLine = `  ['${registration.id}', ${registration.builderName}],\n`;
  return `${source.slice(0, closeIndex)}${entryLine}${source.slice(closeIndex)}`;
}

/**
 * Inserts the import + RUNBOOK_REGISTRY entry for a new runbook into the
 * analyzer's `main.ts` source.
 *
 * Idempotent: when the builder is already referenced, the source is
 * returned unchanged.
 *
 * @param source - Current `main.ts` content
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
 * Registers a runbook in the analyzer's `main.ts` on disk: reads the file,
 * applies {@link applyRunbookRegistration}, formats, and writes it back.
 *
 * @param mainFilePath - Absolute path to go-analyze-alarm `main.ts`
 * @param registration - Runbook to register
 * @returns `true` when the file was modified, `false` when already registered
 */
export async function registerRunbookInAnalyzer(
  mainFilePath: string,
  registration: RunbookRegistration,
): Promise<boolean> {
  const source = await fs.readFile(mainFilePath, 'utf8');
  const result = applyRunbookRegistration(source, registration);
  if (!result.changed) {
    return false;
  }
  const formatted = await formatTypeScript(result.content, mainFilePath);
  await fs.writeFile(mainFilePath, formatted, 'utf8');
  return true;
}
