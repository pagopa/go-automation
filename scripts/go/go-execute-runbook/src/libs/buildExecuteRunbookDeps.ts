import { Core } from '@go-automation/go-common';
import { WatchtowerClient } from '@go-automation/go-watchtower-client';
import { createServiceRegistry } from 'go-analyze-alarm/api';

import type { ExecuteRunbookConfig } from '../types/ExecuteRunbookConfig.js';
import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';

export async function buildExecuteRunbookDeps(
  script: Core.GOScript,
  config: ExecuteRunbookConfig,
): Promise<ExecuteRunbookDeps> {
  const password = await loadServicePassword(script, config);
  const reloadPassword = async (): Promise<string> => await loadServicePassword(script, config);
  const awsProfiles = script.environment.isAWSManaged ? [] : (config.awsProfiles ?? []);
  const watchtower = new WatchtowerClient({
    baseUrl: config.watchtowerUrl,
    credentials: {
      kind: 'SERVICE',
      serviceId: config.watchtowerServiceId,
      password,
      reloadPassword,
    },
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

async function loadServicePassword(script: Core.GOScript, config: ExecuteRunbookConfig): Promise<string> {
  if (config.watchtowerPassword !== undefined && config.watchtowerPassword !== '') return config.watchtowerPassword;
  if (config.watchtowerServiceSecretArn === undefined || config.watchtowerServiceSecretArn === '') {
    throw configurationFailure('Watchtower service password or secret ARN is required');
  }
  try {
    return await script.aws.services.secretsManager.getSecretString(config.watchtowerServiceSecretArn);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw configurationFailure(`Cannot read Watchtower service credential: ${message}`);
  }
}

function configurationFailure(message: string): Error & { readonly workerFailureCode: 'WORKER_CONFIGURATION_ERROR' } {
  return Object.assign(new Error(message), { workerFailureCode: 'WORKER_CONFIGURATION_ERROR' as const });
}
