/**
 * Send Paper Request Error Check - Input Lines Reader
 */

import { Core } from '@go-automation/go-common';

/**
 * Legge i requestId o IUN da un file di input specificato.
 *
 * @param filePath - Percorso al file di input
 * @returns Array di righe lette dal file
 */
export async function readInputLines(filePath?: string): Promise<string[]> {
  if (!filePath) {
    return [];
  }

  const importer = new Core.GOFileListImporter({ trim: true, skipEmptyLines: true, commentPrefix: '#' });
  const { items } = await importer.import(filePath);
  return items;
}
