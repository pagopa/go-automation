/**
 * Resolution of the send target: environment file + CLI overrides (§7.4).
 */

import { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import type { B2BAccess } from '../types/B2BAccess.js';
import type { DirectDispatchConfig } from '../types/DirectDispatchConfig.js';
import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { SendDispatchNotificationsConfig } from '../types/SendDispatchNotificationsConfig.js';
import type { ValidatedConfig } from '../types/ValidatedConfig.js';
import { DispatchUsageError } from './DispatchUsageError.js';

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
  let dotEnv: ReadonlyMap<string, string>;
  try {
    dotEnv = envFile.source === 'none' ? new Map<string, string>() : Core.GOEnvFileParser.parseFile(envFile.path);
  } catch (error: unknown) {
    // A malformed .env is the operator's to fix: a one-line usage error, not a stack trace.
    throw DispatchUsageError.from(error);
  }
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
  config: Pick<SendDispatchNotificationsConfig, 'environmentsFile'>,
): string | undefined {
  if (config.environmentsFile !== undefined) {
    return script.paths.resolvePath(config.environmentsFile, Core.GOPathType.CONFIG);
  }
  const info = script.paths.getConfigFilePathWithInfo(ENVIRONMENTS_FILE);
  return info.source === 'none' ? undefined : info.path;
}

/**
 * Whether the run calls the B2B API of SEND: `e2e` with `send` or `verify`.
 * With only `request-id` the run reads `pn-Timelines` and needs neither an
 * API key nor a base path.
 *
 * @param config - Validated configuration
 * @returns Whether a B2B target is required
 */
export function usesB2B(config: ValidatedConfig): boolean {
  return config.mode === 'e2e' && (config.phases.includes('send') || config.phases.includes('verify'));
}

/**
 * Builds the target of the run: the selected environment with the CLI
 * overrides, or an ad-hoc target from `--base-path` and `--pn-api-key`; in
 * `direct`, pn-external-channels through the tunnel. The B2B API key is
 * resolved only when the run calls the B2B API.
 *
 * @param script - GOScript instance
 * @param config - Validated configuration
 * @param loader - Environment loader
 * @returns The target
 * @throws DispatchUsageError when the environment or the B2B parameters are missing
 */
export async function resolveTarget(
  script: Core.GOScript,
  config: ValidatedConfig,
  loader: Dispatch.EnvironmentLoader,
): Promise<DispatchTarget> {
  if (config.mode === 'direct') return directTarget(config);
  const b2bNeeded = usesB2B(config);
  if (config.env === undefined) return adHocTarget(config, b2bNeeded);

  const filePath = resolveEnvironmentsFile(script, config);
  if (filePath === undefined) {
    throw new DispatchUsageError(
      `--env ${config.env}: no ${ENVIRONMENTS_FILE} found (see configs/environments.example.yaml)`,
    );
  }
  const file = await loader.load(filePath).catch((error: unknown) => {
    throw DispatchUsageError.from(error);
  });
  const definition = file.environments.get(config.env);
  if (definition === undefined) {
    const known = [...file.environments.keys()].join(', ');
    throw new DispatchUsageError(`Environment "${config.env}" not found in ${file.source} (available: ${known})`);
  }
  const groupId = config.groupId ?? definition.groupId;
  const sender = definition.sender ?? cliSender(config);
  if (b2bNeeded && config.pnApiKey !== undefined) {
    // GOScript also fills pn.api.key from the PN_API_KEY variable: with --env it must never replace the key.
    script.logger.warning(
      `pn.api.key ignorata (--pn-api-key o variabile PN_API_KEY): con --env la chiave viene solo da ` +
        `$${definition.apiKeyVariable} (${file.source})`,
    );
  }
  const b2b = b2bNeeded ? environmentB2B(config, loader, file, definition) : undefined;
  return {
    name: definition.name,
    production: definition.production,
    defaults: definition.defaults,
    ...(definition.description !== undefined && { description: definition.description }),
    ...(b2b !== undefined && { b2b }),
    ...(groupId !== undefined && { groupId }),
    ...(sender !== undefined && { sender }),
    ...(definition.sharedDocument !== undefined && { sharedDocument: definition.sharedDocument }),
    ...(definition.awsProfile !== undefined && { awsProfile: definition.awsProfile }),
  };
}

/**
 * B2B access of an environment. The API key comes only from the variable the
 * environment names (`apiKey: ${VAR}`): `pn.api.key` is not an override here,
 * because GOScript also fills it from the `PN_API_KEY` variable, which would
 * silently replace the key of the chosen environment. `--pn-api-key` is for
 * ad-hoc runs (without `--env`).
 */
function environmentB2B(
  config: ValidatedConfig,
  loader: Dispatch.EnvironmentLoader,
  file: Dispatch.EnvironmentsFile,
  definition: Dispatch.EnvironmentDefinition,
): B2BAccess {
  const override = config.basePath;
  const basePath = override === undefined ? definition.basePath : normalizeCliBasePath(override);
  const environment = resolveEnvironment(loader, file, definition.name);
  return {
    basePath,
    apiKey: environment.apiKey,
    apiKeyLabel: `$${environment.apiKeyVariable} ${Dispatch.apiKeyFingerprint(environment.apiKey)}`,
  };
}

function adHocTarget(config: ValidatedConfig, b2bNeeded: boolean): DispatchTarget {
  const sender = cliSender(config);
  const common = {
    name: 'ad-hoc',
    production: false,
    defaults: new Map<Dispatch.CanonicalField, string>(),
    ...(config.groupId !== undefined && { groupId: config.groupId }),
    ...(sender !== undefined && { sender }),
  };
  if (!b2bNeeded) return common;
  const { basePath } = config;
  if (basePath === undefined || config.pnApiKey === undefined) {
    throw new DispatchUsageError('Set --env, or both --base-path and --pn-api-key for an ad-hoc run');
  }
  return {
    ...common,
    b2b: {
      basePath: normalizeCliBasePath(basePath),
      apiKey: config.pnApiKey,
      // GOScript fills pn.api.key from the flag or from the PN_API_KEY variable: the label names both.
      apiKeyLabel: `--pn-api-key/PN_API_KEY ${Dispatch.apiKeyFingerprint(config.pnApiKey)}`,
    },
  };
}

/**
 * `direct` mode: pn-external-channels through the tunnel, no API key (§9.1).
 * The tunnel host cannot tell production apart, so `--ec-production` marks
 * the target as production (confirmation with `--confirm-production`).
 */
function directTarget(config: DirectDispatchConfig): DispatchTarget {
  return {
    name: 'direct',
    description: 'pn-external-channels',
    externalChannels: { baseUrl: config.ecBaseUrl, clientId: config.ecClientId },
    production: config.ecProduction,
    defaults: new Map(),
  };
}

function cliSender(config: ValidatedConfig): Dispatch.DispatchSender | undefined {
  if (config.senderTaxId === undefined || config.senderDenomination === undefined) return undefined;
  return { taxId: config.senderTaxId, denomination: config.senderDenomination };
}

/** Selects the environment and resolves its API key; a missing variable is a usage error. */
function resolveEnvironment(
  loader: Dispatch.EnvironmentLoader,
  file: Dispatch.EnvironmentsFile,
  name: string,
): Dispatch.Environment {
  try {
    return loader.resolve(file, name);
  } catch (error: unknown) {
    throw DispatchUsageError.from(error);
  }
}

/** `--base-path` with scheme and without trailing slashes; a malformed value is a usage error. */
function normalizeCliBasePath(basePath: string): string {
  try {
    return Dispatch.normalizeBasePath(basePath, '--base-path');
  } catch (error: unknown) {
    throw DispatchUsageError.from(error);
  }
}
