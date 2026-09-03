import { Core } from '@go-automation/go-common';
import { createServiceRegistry } from '@go-automation/go-runbook/catalog';

import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import { resolveRunbookCacheDescriptor } from '@go-automation/go-watchtower-runbook';
import type { RunbookCheckContext } from '@go-automation/go-watchtower-runbook';

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
    // This script renders its own coverage table: the per-step runbook
    // narrative must stay out of stdout.
    services: createServiceRegistry(options.script, NOOP_RUNBOOK_REPORTER),
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
