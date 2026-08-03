import fs from 'node:fs/promises';
import path from 'node:path';

async function listDirectoryNames(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function isMissingPathError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

async function findConfigFile(scriptDirectory: string): Promise<string | undefined> {
  const configFile = path.join(scriptDirectory, 'src', 'config.ts');

  try {
    return (await fs.stat(configFile)).isFile() ? configFile : undefined;
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Finds configs in the supported scripts/<category>/<script>/src/config.ts layout.
 */
export async function findScriptConfigFiles(scriptsDirectory: string): Promise<string[]> {
  const categoryNames = await listDirectoryNames(scriptsDirectory);
  const scriptDirectories = (
    await Promise.all(
      categoryNames.map(async (categoryName) => {
        const categoryDirectory = path.join(scriptsDirectory, categoryName);
        const scriptNames = await listDirectoryNames(categoryDirectory);
        return scriptNames.map((scriptName) => path.join(categoryDirectory, scriptName));
      }),
    )
  ).flat();

  const configFiles = await Promise.all(scriptDirectories.map(findConfigFile));
  return configFiles.filter((configFile): configFile is string => configFile !== undefined).sort();
}
