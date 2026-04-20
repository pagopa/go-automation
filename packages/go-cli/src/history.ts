import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
const HISTORY_FILE = path.join(dirName, '../.go-cli-history.json');
const MAX_HISTORY = 5;

/**
 * Manages the execution history of scripts
 */
export class HistoryManager {
  /**
   * Get the list of recently executed script IDs
   */
  public async getHistory(): Promise<string[]> {
    try {
      const data = await fs.readFile(HISTORY_FILE, 'utf-8');
      const history = JSON.parse(data) as unknown;
      return Array.isArray(history) && history.every((id) => typeof id === 'string') ? history : [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Add a script ID to the history
   */
  public async add(scriptId: string): Promise<void> {
    const history = await this.getHistory();

    // Remove if already exists (to move it to the top)
    const filtered = history.filter((id) => id !== scriptId);

    // Add to the beginning
    const newHistory = [scriptId, ...filtered].slice(0, MAX_HISTORY);

    try {
      await fs.writeFile(HISTORY_FILE, JSON.stringify(newHistory, null, 2));
    } catch (_error) {
      // Non-fatal
    }
  }
}
