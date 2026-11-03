/**
 * Resolution of the send target: environment file + CLI overrides (§7.4).
 */

import { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { SendDispatchNotificationsConfig } from '../types/SendDispatchNotificationsConfig.js';

const ENVIRONMENTS_FILE = 'environments.yaml';

/**
 * Creates the environment loader: variables come from the shell first, then
 * from the GOScript `.env` file (gitignored), so `${PN_API_KEY_…}` works in
 * both places.
 *
 * @param script - GOScript instance (for the `.env` path)
 * @returns The loader
 */
export function createEnvironmentLoader(script: Core.GOScript): Dispatch.EnvironmentLoader {
  const envFile = script.paths.getConfigFilePathWithInfo('.env');
  const dotEnv = envFile.source === 'none' ? new Map<string, string>() : Core.GOEnvFileParser.parseFile(envFile.path);
  return new Dispatch.EnvironmentLoader(
    (name: string): string | undefined => Dispatch.processEnvironmentLookup(name) ?? dotEnv.get(name),
  );
}

/**
 * Resolves the path of the environments file: `--environments-file`, or
 * `environments.yaml` in the data configs dir (`data/send-dispatch-notifications/configs/`)
 * or in the local `configs/` dir.
 *
 * @param script - GOScript instance
 * @param config - Script configuration
 * @returns Absolute path, or `undefined` when no file exists
 */
export function resolveEnvironmentsFile(
  script: Core.GOScript,
  config: SendDispatchNotificationsConfig,
): string | undefined {
  if (config.environmentsFile !== undefined) {
    return script.paths.resolvePath(config.environmentsFile, Core.GOPathType.CONFIG);
  }
  const info = script.paths.getConfigFilePathWithInfo(ENVIRONMENTS_FILE);
  return info.source === 'none' ? undefined : info.path;
}

/**
 * Builds the target of the run: the selected environment with the CLI
 * overrides, or an ad-hoc target from `--base-path` and `--pn-api-key`.
 *
 * @param script - GOScript instance
 * @param config - Script configuration
 * @param loader - Environment loader
 * @returns The target
 */
export async function resolveTarget(
  script: Core.GOScript,
  config: SendDispatchNotificationsConfig,
  loader: Dispatch.EnvironmentLoader,
): Promise<DispatchTarget> {
  if (config.env === undefined) return adHocTarget(config);

  const filePath = resolveEnvironmentsFile(script, config);
  if (filePath === undefined) {
    throw new Error(`--env ${config.env}: no ${ENVIRONMENTS_FILE} found (see configs/environments.example.yaml)`);
  }
  const environment = loader.resolve(await loader.load(filePath), config.env);
  const apiKey = config.pnApiKey ?? environment.apiKey;
  const groupId = config.groupId ?? environment.groupId;
  const sender = environment.sender ?? cliSender(config);
  const awsProfile = environment.awsProfile;
  return {
    name: environment.name,
    basePath: config.basePath === undefined ? environment.basePath : Dispatch.normalizeBasePath(config.basePath),
    apiKey,
    apiKeyLabel:
      config.pnApiKey === undefined
        ? `$${environment.apiKeyVariable} ${Dispatch.apiKeyFingerprint(apiKey)}`
        : `--pn-api-key ${Dispatch.apiKeyFingerprint(apiKey)}`,
    production: environment.production,
    defaults: environment.defaults,
    ...(environment.description !== undefined && { description: environment.description }),
    ...(groupId !== undefined && { groupId }),
    ...(sender !== undefined && { sender }),
    ...(environment.sharedDocument !== undefined && { sharedDocument: environment.sharedDocument }),
    ...(awsProfile !== undefined && { awsProfile }),
  };
}

function adHocTarget(config: SendDispatchNotificationsConfig): DispatchTarget {
  if (config.basePath === undefined || config.pnApiKey === undefined) {
    throw new Error('Set --env, or both --base-path and --pn-api-key for an ad-hoc run');
  }
  const sender = cliSender(config);
  return {
    name: 'ad-hoc',
    basePath: Dispatch.normalizeBasePath(config.basePath),
    apiKey: config.pnApiKey,
    apiKeyLabel: `--pn-api-key ${Dispatch.apiKeyFingerprint(config.pnApiKey)}`,
    production: false,
    defaults: new Map(),
    ...(config.groupId !== undefined && { groupId: config.groupId }),
    ...(sender !== undefined && { sender }),
  };
}

function cliSender(config: SendDispatchNotificationsConfig): Dispatch.DispatchSender | undefined {
  if (config.senderTaxId === undefined || config.senderDenomination === undefined) return undefined;
  return { taxId: config.senderTaxId, denomination: config.senderDenomination };
}
