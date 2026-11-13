import type { GOScript } from '@go-automation/go-script';
import { GOHttpClient } from '@pagopa/go-common/http';
import { GOLogger } from '@pagopa/go-common/logging';

import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import { resolveRunbookCacheDescriptor } from '@go-automation/go-watchtower-runbook';
import type { RunbookCheckAccounts, RunbookCheckContext } from '@go-automation/go-watchtower-runbook';
import type { ServiceRegistryResolverFn } from '@pagopa/go-runbook/toolkits/common';
import {
  bindServicesToOccurrence,
  buildServiceRegistry,
  createAwsAccountsPort,
  toAwsAccountsConfig,
} from '@pagopa/go-runbook/runtime';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { Connection } from './resolveClient.js';
import type { ProductAlarm } from '../types/ProductAlarm.js';
import type { ResolvedAnalysisMatcher } from './resolveAnalysisMatcher.js';
import { NOOP_RUNBOOK_REPORTER } from '@pagopa/go-runbook';

export interface BuildCheckContextOptions {
  readonly script: GOScript;
  readonly connection: Connection;
  readonly target: ProductAlarm;
  readonly config: GoRtaCheckConfig;
  readonly awsProfiles: ReadonlyArray<string>;
  readonly analysisMatcher: ResolvedAnalysisMatcher;
}

/**
 * Builds the per-run context reused by every occurrence.
 *
 * @param options - Static run dependencies and configuration
 * @returns The occurrence check context
 */
export function buildCheckContext(options: BuildCheckContextOptions): RunbookCheckContext {
  const accounts = buildCheckAccounts(options.script, options.config);
  return {
    servicesFor:
      accounts.binding === 'oam' ? buildOamScopedServices(options.script) : buildAccountScopedServices(options.script),
    engineLogger: new GOLogger(),
    client: options.connection.client,
    productId: options.target.productId,
    productName: options.target.productName,
    alarmName: options.target.alarmName,
    runbook: resolveRunbookCacheDescriptor(options.target.alarmName),
    awsProfiles: options.awsProfiles,
    analysisCache: new Map<string, AlarmAnalysisDto | undefined>(),
    analysisMatcher: options.analysisMatcher.match,
    matchOptions: {
      includeIgnorable: options.config.includeIgnorable === true,
      includeIncomplete: options.config.includeIncomplete === true,
    },
    force: options.config.force === true,
    accounts,
  };
}

/**
 * Resolves the runbook collaborators through OAM (EVO-AWSACCT-OPUS-01 §6.1):
 * the configured identity belongs to the monitoring account, so no profile of the
 * occurrence's source account is required; CloudWatch Logs is targeted at the
 * occurrence account and read by ARN.
 *
 * @param script - The running script, with its AWS providers
 * @returns A resolver from execution target to OAM-bound services
 */
function buildOamScopedServices(script: GOScript): ServiceRegistryResolverFn {
  const http = new GOHttpClient({});
  const base = buildServiceRegistry(script.aws.services, NOOP_RUNBOOK_REPORTER, http);
  return async (target, activeOperations) => {
    await Promise.resolve();
    if (activeOperations === undefined) {
      throw new Error('OAM services need the remote-operation registry of the occurrence');
    }
    return {
      services: bindServicesToOccurrence(base, { target, activeOperations, mode: 'oam-target' }),
      awsProfiles: script.aws.services.profileNames,
    };
  };
}

/**
 * Account port of the run (EVO-AWSACCT-OPUS-01 §8.2), built with **every**
 * configured profile: a runbook's logical account may live outside the account of
 * the occurrence, so the account-scoped services are not enough. Each occurrence
 * binds it to its own account.
 *
 * @param script - The running script, with its AWS providers
 * @param config - Script configuration (`aws.account.*`)
 * @returns The account port and the settings that enter the cache fingerprint
 */
function buildCheckAccounts(script: GOScript, config: GoRtaCheckConfig): RunbookCheckAccounts {
  const accounts = toAwsAccountsConfig({
    ...(config.awsAccountDirectory === undefined ? {} : { directory: config.awsAccountDirectory }),
    ...(config.awsAccountBinding === undefined ? {} : { binding: config.awsAccountBinding }),
    ...(config.awsAccountPermissionSets === undefined ? {} : { permissionSets: config.awsAccountPermissionSets }),
    region: script.aws.clients.first.getRegion(),
    defaultBinding: 'profiles',
  });
  return {
    // No diagnostics sink: this script owns stdout for its coverage table.
    port: createAwsAccountsPort(accounts, {
      profiles: script.aws.clients,
      monitoring: script.aws.services.cloudWatchLogs,
    }),
    binding: accounts.binding,
    permissionSets: accounts.permissionSets ?? [],
  };
}

/**
 * Resolves the runbook collaborators against the account of each occurrence.
 *
 * The AWS provider owns the caches — profile identities and the services per
 * target — so this holds no state of its own beyond the HTTP client, which is
 * shared because it has no account affinity. The reporter is the NOOP one: this
 * script renders its own coverage table, so the per-step narrative must stay
 * out of stdout.
 *
 * @param script - The running script, with its AWS providers
 * @returns A resolver from execution target to services
 */
function buildAccountScopedServices(script: GOScript): ServiceRegistryResolverFn {
  const http = new GOHttpClient({});
  return async (target) => {
    const services = await script.aws.servicesFor(target);
    return {
      services: buildServiceRegistry(services, NOOP_RUNBOOK_REPORTER, http),
      awsProfiles: services.profileNames,
    };
  };
}
