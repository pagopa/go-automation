import * as fs from 'node:fs/promises';

const CATALOG_ENTRY = /^ {2}'?([^':]+)'?:\s*'?([^'\s]+)'?\s*$/u;

/**
 * Reads the default `catalog:` of `pnpm-workspace.yaml`: the versions the published manifests use
 * for `catalog:` dependencies, and the versions the scenarios install for the SDK peers.
 *
 * @param workspaceFile - Path of `pnpm-workspace.yaml`
 * @returns Version range of each catalog package
 */
export async function readCatalogVersions(workspaceFile: string): Promise<ReadonlyMap<string, string>> {
  return parseCatalogVersions(await fs.readFile(workspaceFile, 'utf8'));
}

/**
 * Parses the `catalog:` block of a `pnpm-workspace.yaml` text (two-space indented `name: range` lines).
 *
 * @param text - File content
 * @returns Version range of each catalog package
 */
export function parseCatalogVersions(text: string): ReadonlyMap<string, string> {
  const versions = new Map<string, string>();
  let inCatalog = false;
  for (const line of text.split('\n')) {
    if (/^catalog:\s*$/u.test(line)) {
      inCatalog = true;
      continue;
    }
    if (!inCatalog) continue;
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!line.startsWith('  ')) break;
    const match = CATALOG_ENTRY.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) versions.set(match[1], match[2]);
  }
  return versions;
}
