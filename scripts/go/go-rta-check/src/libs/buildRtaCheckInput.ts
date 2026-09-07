import type { RtaCheckInput } from '@go-automation/go-watchtower-runbook';

import type { ProductAlarm } from '../types/ProductAlarm.js';
import type { ResolvedEnvironment } from '../types/ResolvedEnvironment.js';
import type { Connection } from './resolveClient.js';
import type { ResolvedAnalysisMatcher } from './resolveAnalysisMatcher.js';

export interface BuildRtaCheckInputOptions {
  readonly connection: Connection;
  readonly target: ProductAlarm;
  readonly environment: ResolvedEnvironment;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly awsProfiles: ReadonlyArray<string>;
  readonly analysisMatcher: ResolvedAnalysisMatcher;
}

/**
 * Builds the static input section stored in the RTA report.
 *
 * @param options - Resolved run inputs
 * @returns The report input contract
 */
export function buildRtaCheckInput(options: BuildRtaCheckInputOptions): RtaCheckInput {
  return {
    watchtowerUrl: options.connection.baseUrl,
    productId: options.target.productId,
    productName: options.target.productName,
    environmentName: options.environment.environmentName,
    alarmId: options.target.alarm.id,
    alarmName: options.target.alarmName,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    awsProfiles: [...options.awsProfiles],
    analysisMatcher: options.analysisMatcher.kind,
    ...(options.analysisMatcher.semanticThreshold !== undefined
      ? { goAiSemanticThreshold: options.analysisMatcher.semanticThreshold }
      : {}),
  };
}
