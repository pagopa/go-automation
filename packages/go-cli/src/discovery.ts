import { glob } from 'glob';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Core } from '@go-automation/go-common';

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
const ROOT_DIR = path.resolve(dirName, '../../..');

export interface DiscoveredScript {
  readonly id: string; // Directory name (e.g., go-report-alarms)
  readonly category: string; // Parent directory name (e.g., go, send)
  readonly metadata: Core.GOScriptMetadata;
  readonly parameters: ReadonlyArray<Core.GOConfigParameterOptions>;
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

/**
 * Discovery Engine - Scans the scripts/ directory for valid GOScripts
 */
export async function discoverScripts(): Promise<DiscoveredScript[]> {
  const scriptsDir = path.join(ROOT_DIR, 'scripts');

  // Find all src/config.ts files that define GOScripts
  const configFiles = await glob('**/src/config.ts', {
    cwd: scriptsDir,
    absolute: true,
  });

  const discovered: DiscoveredScript[] = [];

  for (const configFile of configFiles) {
    try {
      // Dynamic import using tsx/esm loader
      // We use pathToFileURL to ensure it works on Windows and handles ESM correctly
      const module = (await import(pathToFileURL(configFile).href)) as ScriptConfigModule;

      if (module.scriptMetadata && module.scriptParameters) {
        const scriptRoot = path.dirname(path.dirname(configFile));
        const category = path.basename(path.dirname(scriptRoot));
        const id = path.basename(scriptRoot);

        discovered.push({
          id,
          category,
          metadata: module.scriptMetadata,
          parameters: module.scriptParameters,
          paths: {
            root: scriptRoot,
            config: configFile,
            entryTs: path.join(scriptRoot, 'src/index.ts'),
            entryJs: path.join(scriptRoot, 'dist/index.js'),
          },
        });
      }
    } catch (_error) {
      // Silently skip if import fails (might be a template or incomplete script)
      // In a real scenario, we might want to log this at a debug level
    }
  }

  return discovered.sort((a, b) => a.id.localeCompare(b.id));
}
