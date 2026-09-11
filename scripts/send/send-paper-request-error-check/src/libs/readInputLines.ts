/**
 * Send Paper Request Error Check - Input Lines Reader
 */

import fs from 'fs';
import { Core } from '@go-automation/go-common';

/**
 * Legge i requestId o IUN da un file di input specificato.
 *
 * @param filePath - Percorso al file di input
 * @returns Array di righe lette dal file
 */
export async function readInputLines(filePath?: string): Promise<string[]> {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  const importer = new Core.GOFileListImporter({ skipEmptyLines: true });
  const { items } = await importer.import(filePath);
  return items.map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'));
}
