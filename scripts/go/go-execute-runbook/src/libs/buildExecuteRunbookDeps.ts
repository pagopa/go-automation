import { Core } from '@go-automation/go-common';
import { WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { WatchtowerAuthCredentials } from '@go-automation/go-watchtower-client';
import { createServiceRegistry } from 'go-analyze-alarm/api';

import type { ExecuteRunbookConfig } from '../types/ExecuteRunbookConfig.js';
import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';

type ExecuteRunbookAuthMode = 'SERVICE' | 'CLI_PAT';

export interface BuildExecuteRunbookDepsOptions {
  readonly auth: ExecuteRunbookAuthMode;
}

type WatchtowerCredentialsLoaderFn = () => Promise<WatchtowerAuthCredentials> | WatchtowerAuthCredentials;

export async function buildExecuteRunbookDeps(
  script: Core.GOScript,
  config: ExecuteRunbookConfig,
  options: BuildExecuteRunbookDepsOptions = { auth: 'SERVICE' },
): Promise<ExecuteRunbookDeps> {
  const awsProfiles = script.environment.isAWSManaged ? [] : (config.awsProfiles ?? []);
  const watchtower = new WatchtowerClient({
    baseUrl: config.watchtowerUrl,
    credentials: await resolveWatchtowerCredentials(script, config, options.auth),
  });
  const services = createServiceRegistry(script);
  return {
    watchtower,
    logger: script.logger,
    services,
    awsProfiles,
    useConfiguredAwsProfiles: awsProfiles.length > 0,
  };
}

async function resolveWatchtowerCredentials(
  script: Core.GOScript,
  config: ExecuteRunbookConfig,
  auth: ExecuteRunbookAuthMode,
): Promise<WatchtowerAuthCredentials> {
  const loaders: Record<ExecuteRunbookAuthMode, WatchtowerCredentialsLoaderFn> = {
    ['CLI_PAT']: () => resolveCliPatCredentials(config),
    ['SERVICE']: async () => await resolveServiceCredentials(script, config),
  };
  return await loaders[auth]();
}

function resolveCliPatCredentials(config: ExecuteRunbookConfig): WatchtowerAuthCredentials {
  const token = config.watchtowerHumanToken?.trim();
  if (token === undefined || token === '') {
    throw configurationFailure('Watchtower human token is required for CLI-created executions');
  }
  return { kind: 'CLI_PAT', token };
}

async function resolveServiceCredentials(
  script: Core.GOScript,
  config: ExecuteRunbookConfig,
): Promise<WatchtowerAuthCredentials> {
  const password = await loadServicePassword(script, config);
  const reloadPassword = async (): Promise<string> => await loadServicePassword(script, config);
  return {
    kind: 'SERVICE',
    serviceId: config.watchtowerServiceId,
    password,
    reloadPassword,
  };
}

async function loadServicePassword(script: Core.GOScript, config: ExecuteRunbookConfig): Promise<string> {
  const password = config.watchtowerPassword?.trim();
  if (password !== undefined && password !== '') return password;
  const serviceSecretArn = config.watchtowerServiceSecretArn?.trim();
  if (serviceSecretArn === undefined || serviceSecretArn === '') {
    throw configurationFailure('Watchtower service password or secret ARN is required');
  }
  try {
    return await script.aws.services.secretsManager.getSecretString(serviceSecretArn);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw configurationFailure(`Cannot read Watchtower service credential: ${message}`);
  }
}

function configurationFailure(message: string): Error & { readonly workerFailureCode: 'WORKER_CONFIGURATION_ERROR' } {
  return Object.assign(new Error(message), { workerFailureCode: 'WORKER_CONFIGURATION_ERROR' as const });
}
