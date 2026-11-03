/**
 * `--list-envs`: environments of the file, without API keys (§7.4.1).
 */

import type { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

/**
 * Prints the environments of the file: name, description, URL, group, API
 * key variable and whether it is set (with fingerprint only).
 *
 * @param logger - Script logger
 * @param loader - Environment loader
 * @param filePath - Environments file
 */
export async function listEnvironments(
  logger: Core.GOLogger,
  loader: Dispatch.EnvironmentLoader,
  filePath: string,
): Promise<void> {
  const file = await loader.load(filePath);
  logger.section(`Ambienti in ${filePath}`);
  logger.simpleTable(
    [...file.environments.values()].map((environment) => {
      const apiKey = loader.peekApiKey(environment);
      return {
        nome: environment.name,
        descrizione: environment.description ?? '',
        url: environment.basePath,
        groupId: environment.groupId ?? '',
        produzione: environment.production ? 'sì' : 'no',
        apiKey: `$${environment.apiKeyVariable} ${apiKey === undefined ? '(non impostata)' : Dispatch.apiKeyFingerprint(apiKey)}`,
      };
    }),
  );
}
