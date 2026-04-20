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
  readonly parameters?: ReadonlyArray<Core.GOConfigParameterOptions>;
  readonly mtime: number; // Last modification time of the config file
  readonly paths: {
    readonly root: string;
    readonly config: string;
    readonly entryTs: string;
    readonly entryJs: string;
  };
}

interface FailedScript {
  readonly id: string;
  readonly category: string;
  readonly configPath: string;
  readonly error: string;
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

// Store failed scripts in a module-level variable for the 'doctor' command
let discoveryErrors: FailedScript[] = [];

/**
 * Discovery Engine - Scans the scripts/ directory for valid GOScripts
 * Uses a local cache to avoid re-importing unchanged config files.
 */
export async function discoverScripts(): Promise<DiscoveredScript[]> {
  const scriptsDir = path.join(ROOT_DIR, 'scripts');
  discoveryErrors = [];

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
    const scriptRoot = path.dirname(path.dirname(configFile));
    const category = path.basename(path.dirname(scriptRoot));
    const id = path.basename(scriptRoot);

    try {
      const stats = await fs.stat(configFile);
      const mtime = stats.mtimeMs;

      // 3. Check cache
      const cached = cache[configFile];

      if (cached?.mtime === mtime) {
        discovered.push({
          ...cached,
        });
        continue;
      }

      // 4. Cache miss: Dynamic import using tsx/esm loader
      const module = (await import(pathToFileURL(configFile).href)) as ScriptConfigModule;

      if (module.scriptMetadata && module.scriptParameters) {
        // Extract keywords from package.json if it exists
        let keywords: string[] = [];
        try {
          const packageJsonPath = path.join(scriptRoot, 'package.json');
          const packageJsonData = await fs.readFile(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(packageJsonData) as { keywords?: string[] };
          if (Array.isArray(packageJson.keywords)) {
            keywords = packageJson.keywords;
          }
        } catch (_error) {
          // package.json missing or invalid keywords, ignore
        }

        const metadata: Core.GOScriptMetadata = {
          ...module.scriptMetadata,
          keywords: [...(module.scriptMetadata.keywords ?? []), ...keywords],
        };

        const scriptData: DiscoveredScript = {
          id,
          category,
          metadata,
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

        // Update cache entry
        cache[configFile] = {
          id,
          category,
          metadata,
          mtime,
          paths: scriptData.paths,
        };
        cacheUpdated = true;
      }
    } catch (error) {
      // Capture error and continue
      discoveryErrors.push({
        id,
        category,
        configPath: configFile,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 5. Cleanup and Save cache if updated
  if (cacheUpdated) {
    try {
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

/**
 * Get scripts that failed discovery
 */
export function getDiscoveryErrors(): FailedScript[] {
  return [...discoveryErrors];
}

/**
 * Loads script parameters on demand
 */
export async function loadScriptParameters(
  script: DiscoveredScript,
): Promise<ReadonlyArray<Core.GOConfigParameterOptions>> {
  if (script.parameters) {
    return script.parameters;
  }

  try {
    const module = (await import(pathToFileURL(script.paths.config).href)) as ScriptConfigModule;
    // Mutating the script object to cache the loaded parameters (internal optimization)
    Object.assign(script, { parameters: module.scriptParameters });
    return module.scriptParameters;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load parameters for script ${script.id}: ${message}`, {
      cause: error,
    });
  }
}

/**
 * Get the discovery cache metadata (last modified time)
 */
export async function getDiscoveryCacheMetadata(): Promise<{ lastUpdate: Date | undefined }> {
  try {
    const stats = await fs.stat(CACHE_FILE);
    return { lastUpdate: stats.mtime };
  } catch (_error) {
    return { lastUpdate: undefined };
  }
}
