import { glob } from 'glob';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { Core } from '@go-automation/go-common';

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
const ROOT_DIR = path.resolve(dirName, '../../..');
const CACHE_FILE = path.join(dirName, '../.discovery-cache.json');

export interface DiscoveredScript {
  readonly id: string; // Directory name (e.g., go-report-alarms)
  readonly category: string; // Parent directory name (e.g., go, send)
  readonly metadata: Core.GOScriptMetadata;
  readonly parameters: ReadonlyArray<Core.GOConfigParameterOptions>;
  readonly mtime: number; // Last modification time of the config file
  readonly paths: {
    readonly root: string;
    readonly config: string;
    readonly entryTs: string;
    readonly entryJs: string;
  };
}

interface ScriptConfigModule {
  scriptMetadata: Core.GOScriptMetadata;
  scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions>;
}

interface DiscoveryCacheEntry {
  id: string;
  category: string;
  metadata: Core.GOScriptMetadata;
  mtime: number;
  paths: DiscoveredScript['paths'];
}

interface DiscoveryCache {
  [configPath: string]: DiscoveryCacheEntry;
}

/**
 * Discovery Engine - Scans the scripts/ directory for valid GOScripts
 * Uses a local cache to avoid re-importing unchanged config files.
 */
export async function discoverScripts(): Promise<DiscoveredScript[]> {
  const scriptsDir = path.join(ROOT_DIR, 'scripts');

  // 1. Load cache
  let cache: DiscoveryCache = {};
  try {
    const cacheData = await fs.readFile(CACHE_FILE, 'utf-8');
    cache = JSON.parse(cacheData) as DiscoveryCache;
  } catch (_error) {
    // Cache miss or invalid, start fresh
  }

  // 2. Find all src/config.ts files
  const configFiles = await glob('**/src/config.ts', {
    cwd: scriptsDir,
    absolute: true,
  });

  const discovered: DiscoveredScript[] = [];
  let cacheUpdated = false;

  for (const configFile of configFiles) {
    try {
      const stats = await fs.stat(configFile);
      const mtime = stats.mtimeMs;

      // 3. Check cache
      const cached = cache[configFile];

      // NOTE: parameters are NOT cached because they can contain functions (validators, fallbacks)
      // Step 2 (Lazy Loading) will optimize this by deferring the import.

      // Dynamic import using tsx/esm loader
      const module = (await import(pathToFileURL(configFile).href)) as ScriptConfigModule;

      if (module.scriptMetadata && module.scriptParameters) {
        const scriptRoot = path.dirname(path.dirname(configFile));
        const category = path.basename(path.dirname(scriptRoot));
        const id = path.basename(scriptRoot);

        const scriptData: DiscoveredScript = {
          id,
          category,
          metadata: module.scriptMetadata,
          parameters: module.scriptParameters,
          mtime,
          paths: {
            root: scriptRoot,
            config: configFile,
            entryTs: path.join(scriptRoot, 'src/index.ts'),
            entryJs: path.join(scriptRoot, 'dist/index.js'),
          },
        };

        discovered.push(scriptData);

        // Update cache entry (storing serializable parts)
        if (cached?.mtime !== mtime) {
          cache[configFile] = {
            id,
            category,
            metadata: module.scriptMetadata,
            mtime,
            paths: scriptData.paths,
          };
          cacheUpdated = true;
        }
      }
    } catch (_error) {
      // Skip invalid scripts
    }
  }

  // 4. Cleanup and Save cache if updated
  if (cacheUpdated) {
    try {
      // Remove entries for files that no longer exist
      const existingConfigs = new Set(configFiles);
      const updatedCache: DiscoveryCache = {};
      for (const [configPath, entry] of Object.entries(cache)) {
        if (existingConfigs.has(configPath)) {
          updatedCache[configPath] = entry;
        }
      }
      await fs.writeFile(CACHE_FILE, JSON.stringify(updatedCache, null, 2));
    } catch (_error) {
      // Failed to save cache, non-fatal
    }
  }

  return discovered.sort((a, b) => a.id.localeCompare(b.id));
}
