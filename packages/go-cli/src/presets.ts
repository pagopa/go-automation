import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
const PRESETS_FILE = path.join(dirName, '../.go-cli-presets.json');

interface ScriptPresets {
  [presetName: string]: string[];
}

interface AllPresets {
  [scriptId: string]: ScriptPresets;
}

/**
 * Preset Manager - Manages reusable argument sets per script
 */
export class PresetManager {
  /**
   * Load all presets from file
   */
  private async loadAll(): Promise<AllPresets> {
    try {
      const data = await fs.readFile(PRESETS_FILE, 'utf-8');
      const parsed = JSON.parse(data) as unknown;
      return typeof parsed === 'object' && parsed !== null ? (parsed as AllPresets) : {};
    } catch (_error) {
      return {};
    }
  }

  /**
   * Get arguments for a specific preset of a script
   */
  public async getPreset(scriptId: string, presetName: string): Promise<string[] | undefined> {
    const all = await this.loadAll();
    return all[scriptId]?.[presetName];
  }

  /**
   * Save a new preset for a script
   */
  public async savePreset(scriptId: string, presetName: string, args: string[]): Promise<void> {
    const all = await this.loadAll();

    all[scriptId] ??= {};
    all[scriptId][presetName] = args;

    try {
      await fs.writeFile(PRESETS_FILE, JSON.stringify(all, null, 2));
    } catch (_error) {
      // Non-fatal
    }
  }

  /**
   * List available presets for a script
   */
  public async listPresets(scriptId: string): Promise<string[]> {
    const all = await this.loadAll();
    return Object.keys(all[scriptId] ?? {});
  }
}
