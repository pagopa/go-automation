import { GOHttpClient } from '@pagopa/go-common/http';
import type { GOScript } from '@go-automation/go-script';
import { type RunbookBuilderFn } from '@pagopa/go-runbook/inventory';
import {
  computeRunbookTimeRange,
  createServiceRegistry,
  createTimeRangeReference,
  toAwsAccountsConfig,
} from '@pagopa/go-runbook/runtime';
import { OperationalRunbookEngine, type AwsExecutionEnvironment } from '@pagopa/go-runbook/toolkits/common';
import type { RunbookExecutionResult } from '@pagopa/go-runbook';

import type { AnalyzableAlarmConfig } from '../types/AnalyzableAlarmConfig.js';
import { saveExecutionTrace } from './saveExecutionTrace.js';
import { saveExecutionOutput } from './saveExecutionOutput.js';
import { renderFinalSummary } from './renderFinalSummary.js';
import { ConsoleRunbookReporter } from '@pagopa/go-runbook';

export interface AnalyzeOccurrenceInput {
  readonly alarmDatetime: string;
  readonly alarmDatetimeEnd?: string;
  readonly outputSuffix?: string;
}

export async function analyzeOccurrence(
  script: GOScript,
  config: AnalyzableAlarmConfig,
  runbookBuilder: RunbookBuilderFn,
  input: AnalyzeOccurrenceInput,
): Promise<void> {
  const runbook = runbookBuilder();
  script.logger.info(`Runbook: ${runbook.metadata.name} v${runbook.metadata.version}`);

  const reference = createTimeRangeReference(input.alarmDatetime, input.alarmDatetimeEnd);
  const { startTime, endTime } = computeRunbookTimeRange(runbook, reference);
  script.logger.info(`Time range: ${startTime} → ${endTime}`);
  const awsRegion = script.aws.clients.first.getRegion();

  const params = new Map<string, string>([
    ['alarmName', config.alarmName],
    ['alarmDatetime', input.alarmDatetime],
    ['awsRegion', awsRegion],
    ['awsProfiles', config.awsProfiles.join(',')],
    ['startTime', startTime],
    ['endTime', endTime],
  ]);
  if (input.alarmDatetimeEnd !== undefined && input.alarmDatetimeEnd.trim() !== '') {
    params.set('alarmDatetimeEnd', input.alarmDatetimeEnd);
  }

  script.logger.info(`Using AWS profiles: ${script.aws.clients.profileNames.join(', ')}`);

  // Logical accounts of multi-account runbooks: the directory comes from the local
  // configuration, never from the code; profiles are matched to accounts through STS.
  const services = createServiceRegistry(
    {
      services: script.aws.services,
      http: new GOHttpClient({}),
      accounts: toAwsAccountsConfig({
        ...(config.awsAccountDirectory === undefined ? {} : { directory: config.awsAccountDirectory }),
        ...(config.awsAccountBinding === undefined ? {} : { binding: config.awsAccountBinding }),
        ...(config.awsAccountEnvironment === undefined ? {} : { environment: config.awsAccountEnvironment }),
        ...(config.awsAccountPermissionSets === undefined ? {} : { permissionSets: config.awsAccountPermissionSets }),
        region: awsRegion,
        defaultBinding: 'profiles',
      }),
      profiles: script.aws.clients,
      accountDiagnostics: (message) => script.logger.info(message),
    },
    new ConsoleRunbookReporter(script.logger),
  );

  script.logger.section('Executing Runbook');

  const engine = new OperationalRunbookEngine(script.logger);
  const environment: AwsExecutionEnvironment = {
    awsProfiles: config.awsProfiles,
    region: awsRegion,
    invokedBy: 'manual',
  };

  const result = await engine.execute(runbook, params, services, environment);

  renderFinalSummary(script.logger, runbook, result);
  renderRunbookResult(script, result);

  const traceFile = await saveExecutionTrace(script, result, config.alarmName, input.outputSuffix);
  await saveExecutionOutput(script, runbook, result, traceFile, input.outputSuffix);
}

function renderRunbookResult(script: GOScript, result: RunbookExecutionResult): void {
  script.logger.section('Runbook Result');
  script.logger.info(`Status: ${result.status}`);
  script.logger.info(`Steps executed: ${result.stepsExecuted}`);
  script.logger.info(`Duration: ${result.durationMs}ms`);

  const [primary, ...rest] = result.matchedCases;
  if (primary === undefined) {
    script.logger.warning('No known case matched');
  } else if (rest.length === 0) {
    script.logger.info(`Matched case: ${primary.description}`);
  } else {
    script.logger.info(`Matched cases (${result.matchedCases.length}):`);
    for (const c of result.matchedCases) {
      script.logger.info(`  - ${c.id} (priority ${c.priority}): ${c.description}`);
    }
  }

  if (result.recoveredErrors.length > 0) {
    script.logger.info(`Recovered errors: ${result.recoveredErrors.length}`);
    for (const err of result.recoveredErrors) {
      script.logger.text(`  - [${err.stepId}] ${err.originalError}`);
    }
  }
}
