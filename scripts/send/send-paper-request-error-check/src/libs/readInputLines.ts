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
  try {
    const { items } = await importer.import(filePath);
    return items;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const errWithCode = error as Error & { code?: string };
      if (errWithCode.code === 'ENOENT' || error.message.includes('ENOENT')) {
        return [];
      }
    } else if (typeof error === 'object' && error !== null && 'code' in error) {
      const errObj = error as { code?: unknown };
      if (errObj.code === 'ENOENT') {
        return [];
      }
    }
    throw error;
  }
}
