import path from 'path';
import { Core } from '@go-automation/go-common';

/**
 * Risolve il percorso di un file o di una directory di output secondo le convenzioni GOScript.
 *
 * @param paths - Istanza di Core.GOPaths fornita da script.paths
 * @param fileName - Nome del file di output (o stringa vuota per ottenere la directory di output)
 * @param outputFolder - Sottocartella opzionale o percorso assoluto
 */
export function resolveOutputPath(
  paths: Core.GOPaths,
  fileName: string = '',
  outputFolder?: string,
): string {
  if (outputFolder && path.isAbsolute(outputFolder)) {
    return fileName ? path.join(outputFolder, fileName) : outputFolder;
  }
  const relativeTarget = outputFolder
    ? (fileName ? path.join(outputFolder, fileName) : outputFolder)
    : fileName;
  return paths.resolvePath(relativeTarget, Core.GOPathType.OUTPUT);
}