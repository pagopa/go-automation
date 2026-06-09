import { Core } from '@go-automation/go-common';
import { createServiceRegistry } from 'go-analyze-alarm/api';

import type { AlarmAnalysisDto } from '../types/WatchtowerDtos.js';
import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { CheckContext } from './checkOccurrence.js';
import type { Connection } from './resolveClient.js';
import type { ProductAlarm } from './resolveProductAlarm.js';
import type { ResolvedAnalysisMatcher } from './resolveAnalysisMatcher.js';
import { resolveRunbookCacheDescriptor } from '../runner/runbookFingerprint.js';

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
export function buildCheckContext(options: BuildCheckContextOptions): CheckContext {
  return {
    services: createServiceRegistry(options.script),
    engineLogger: new Core.GOLogger(),
    client: options.connection.client,
    script: options.script,
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
