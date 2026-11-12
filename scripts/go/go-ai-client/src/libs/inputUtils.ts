import type { GOScript } from '@go-automation/go-script';
import { GOPathType } from '@pagopa/go-common/files';
import { GOTextFileImporter } from '@pagopa/go-common/importers';

/**
 * Loads input from a file path (resolved via GOPaths) or returns the raw string if not a file.
 *
 * @param inputArg - A file path or raw text input
 * @param script - GOScript instance for path resolution
 * @returns The file content if the path exists, otherwise the raw input string
 */
export async function loadInput(inputArg: string, script: GOScript): Promise<string> {
  const resolvedPath = script.paths.resolvePath(inputArg, GOPathType.INPUT);
  const importer = new GOTextFileImporter({ inputPath: resolvedPath, optional: true });
  const content = await importer.import();
  return content ?? inputArg;
}
