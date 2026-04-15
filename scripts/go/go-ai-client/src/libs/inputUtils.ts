import { Core } from '@go-automation/go-common';

/**
 * Loads input from a file path (resolved via GOPaths) or returns the raw string if not a file.
 *
 * @param inputArg - A file path or raw text input
 * @param script - GOScript instance for path resolution
 * @returns The file content if the path exists, otherwise the raw input string
 */
export async function loadInput(inputArg: string, script: Core.GOScript): Promise<string> {
  const resolvedPath = script.paths.resolvePath(inputArg, Core.GOPathType.INPUT);
  const importer = new Core.GOTextFileImporter({ inputPath: resolvedPath, optional: true });
  const content = await importer.import();
  return content ?? inputArg;
}

export function stabilize(raw: string): unknown {
  const stripped = raw
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    return { text: stripped };
  }
}
