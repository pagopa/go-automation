import { GOHttpClient } from '@pagopa/go-common/http';
import type { GOScript } from '@go-automation/go-script';
import { WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { WatchtowerAuthCredentials } from '@go-automation/go-watchtower-client';
import {
  createAwsAccountsPort,
  createServiceRegistry,
  scrubAwsProfileNames,
  toAwsAccountsConfig,
  UnavailableAwsAccountsPort,
  type AwsAccountsConfig,
} from '@pagopa/go-runbook/runtime';

import type { ExecuteRunbookConfig } from '../types/ExecuteRunbookConfig.js';
import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';
import { ConsoleRunbookReporter } from '@pagopa/go-runbook';
import type { AwsAccountsPort, ServiceRegistry } from '@pagopa/go-runbook/toolkits/common';

type ExecuteRunbookAuthMode = 'SERVICE' | 'CLI_PAT';

export interface BuildExecuteRunbookDepsOptions {
  readonly auth: ExecuteRunbookAuthMode;
}

type WatchtowerCredentialsLoaderFn = () => Promise<WatchtowerAuthCredentials> | WatchtowerAuthCredentials;

export async function buildExecuteRunbookDeps(
  script: GOScript,
  config: ExecuteRunbookConfig,
  options: BuildExecuteRunbookDepsOptions = { auth: 'SERVICE' },
): Promise<ExecuteRunbookDeps> {
  const workerArtifactRevision = config.executeRunbookArtifactRevision?.trim();
  if (script.environment.isAWSManaged && (workerArtifactRevision === undefined || workerArtifactRevision === '')) {
    throw configurationFailure('Execute-runbook worker artifact revision is required in AWS-managed execution');
  }
  const awsProfiles = script.environment.isAWSManaged ? [] : (config.awsProfiles ?? []);
  const watchtower = new WatchtowerClient({
    baseUrl: config.watchtowerUrl,
    credentials: await resolveWatchtowerCredentials(script, config, options.auth),
  });
  const services = buildServices(script, config, awsProfiles.length > 0);
  return {
    watchtower,
    logger: script.logger,
    services,
    awsProfiles,
    useConfiguredAwsProfiles: awsProfiles.length > 0,
    ...(workerArtifactRevision === undefined || workerArtifactRevision === '' ? {} : { workerArtifactRevision }),
  };
}

async function resolveWatchtowerCredentials(
  script: GOScript,
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
  script: GOScript,
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

async function loadServicePassword(script: GOScript, config: ExecuteRunbookConfig): Promise<string> {
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

/**
 * Service registry of the worker, with the account port of the logical AWS accounts.
 *
 * An invalid `aws.account.*` configuration does not stop the worker: runbooks
 * without logical accounts keep running, and each runbook that declares them
 * fails before its first step with `AWS_ACCOUNT_DIRECTORY_INVALID`, which closes
 * that execution as a worker configuration failure (EVO-AWSACCT-OPUS-01 §6.4).
 * In AWS-managed execution the binding is always OAM, whatever is configured.
 */
function buildServices(script: GOScript, config: ExecuteRunbookConfig, hasProfiles: boolean): ServiceRegistry {
  const registry = createServiceRegistry(
    { services: script.aws.services, http: new GOHttpClient({}) },
    new ConsoleRunbookReporter(script.logger),
  );
  return { ...registry, awsAccounts: buildAccountsPort(script, config, hasProfiles) };
}

function buildAccountsPort(script: GOScript, config: ExecuteRunbookConfig, hasProfiles: boolean): AwsAccountsPort {
  try {
    return createAwsAccountsPort(accountsConfig(script, config, hasProfiles), {
      profiles: script.aws.clients,
      monitoring: script.aws.services.cloudWatchLogs,
      diagnostics: (message) => script.logger.info(message),
    });
  } catch (error: unknown) {
    const reason = scrubAwsProfileNames(
      error instanceof Error ? error.message : String(error),
      script.aws.clients.profileNames,
    );
    script.logger.error(`Invalid logical-account configuration: ${reason}`);
    return new UnavailableAwsAccountsPort(reason);
  }
}

/** `aws.account.*` of the worker: OAM in AWS-managed execution, profiles locally when configured. */
function accountsConfig(script: GOScript, config: ExecuteRunbookConfig, hasProfiles: boolean): AwsAccountsConfig {
  return toAwsAccountsConfig({
    ...(config.awsAccountDirectory === undefined ? {} : { directory: config.awsAccountDirectory }),
    ...(script.environment.isAWSManaged || config.awsAccountBinding === undefined
      ? {}
      : { binding: config.awsAccountBinding }),
    ...(config.awsAccountPermissionSets === undefined ? {} : { permissionSets: config.awsAccountPermissionSets }),
    region: script.aws.clients.first.getRegion(),
    defaultBinding: !script.environment.isAWSManaged && hasProfiles ? 'profiles' : 'oam',
  });
}
