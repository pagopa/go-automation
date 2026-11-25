/**
 * `--list-envs`: environments of the file, without API keys (§7.4.1).
 */

import type { GOLogger } from '@pagopa/go-common/logging';
import { Dispatch } from '@go-automation/go-send';

import { DispatchUsageError } from './DispatchUsageError.js';

/** One row of the `--list-envs` table (`simpleTable` takes `Record`s); every row has the same columns. */
interface EnvironmentRow extends Record<string, string> {
  readonly nome: string;
  readonly modalità: Dispatch.DispatchMode;
  readonly descrizione: string;
  readonly url: string;
  readonly groupId: string;
  readonly produzione: string;
  readonly apiKey: string;
}

/**
 * Prints the environments of the file, `e2e` then `direct`: name, mode,
 * description, URL (B2B base path or pn-external-channels URL), group,
 * production, and for `e2e` the API key variable and whether it is set
 * (with fingerprint only). `direct` environments have no API key.
 *
 * @param logger - Script logger
 * @param loader - Environment loader
 * @param filePath - Environments file
 */
export async function listEnvironments(
  logger: GOLogger,
  loader: Dispatch.EnvironmentLoader,
  filePath: string,
): Promise<void> {
  const file = await loader.load(filePath).catch((error: unknown) => {
    throw DispatchUsageError.from(error);
  });
  logger.section(`Ambienti in ${filePath}`);
  logger.simpleTable([
    ...[...file.environments.values()].map((environment) => e2eRow(environment, loader.peekApiKey(environment))),
    ...[...file.directEnvironments.values()].map(directRow),
  ]);
}

function e2eRow(environment: Dispatch.EnvironmentDefinition, apiKey: string | undefined): EnvironmentRow {
  return {
    nome: environment.name,
    modalità: 'e2e',
    descrizione: environment.description ?? '',
    url: environment.basePath,
    groupId: environment.groupId ?? '',
    produzione: environment.production ? 'sì' : 'no',
    apiKey: `$${environment.apiKeyVariable} ${apiKey === undefined ? '(non impostata)' : Dispatch.apiKeyFingerprint(apiKey)}`,
  };
}

function directRow(environment: Dispatch.DirectEnvironmentDefinition): EnvironmentRow {
  return {
    nome: environment.name,
    modalità: 'direct',
    descrizione: environment.description ?? '',
    url: environment.ecBaseUrl,
    groupId: '',
    produzione: environment.production ? 'sì' : 'no',
    apiKey: '—',
  };
}
