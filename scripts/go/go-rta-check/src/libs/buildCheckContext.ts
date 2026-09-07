import { Core } from '@go-automation/go-common';

import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import { resolveRunbookCacheDescriptor } from '@go-automation/go-watchtower-runbook';
import type { RunbookCheckContext } from '@go-automation/go-watchtower-runbook';
import type { ServiceRegistryResolverFn } from '@go-automation/go-runbook';
import { buildServiceRegistry } from '@go-automation/go-runbook/catalog';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { Connection } from './resolveClient.js';
import type { ProductAlarm } from '../types/ProductAlarm.js';
import type { ResolvedAnalysisMatcher } from './resolveAnalysisMatcher.js';
import { NOOP_RUNBOOK_REPORTER } from '@go-automation/go-runbook/catalog';

export interface BuildCheckContextOptions {
  readonly script: Core.GOScript;
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
  return {
    servicesFor: buildAccountScopedServices(options.script),
    engineLogger: new Core.GOLogger(),
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
function buildAccountScopedServices(script: Core.GOScript): ServiceRegistryResolverFn {
  const http = new Core.GOHttpClient({});
  return async (target) => {
    const services = await script.aws.servicesFor(target);
    return {
      services: buildServiceRegistry(services, NOOP_RUNBOOK_REPORTER, http),
      awsProfiles: services.profileNames,
    };
  };
}
