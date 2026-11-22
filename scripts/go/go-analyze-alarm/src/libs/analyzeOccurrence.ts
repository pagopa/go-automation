import { GOHttpClient } from '@pagopa/go-common/http';
import type { GOScript } from '@go-automation/go-script';
import { type RunbookBuilderFn } from '@pagopa/go-runbook/inventory';
import { buildOccurrenceParams, createServiceRegistry, toAwsAccountsConfig } from '@pagopa/go-runbook/runtime';
import { OperationalRunbookEngine, type AwsExecutionEnvironment } from '@pagopa/go-runbook/toolkits/common';
import type { RunbookExecutionResult } from '@pagopa/go-runbook';
import { buildCoverageLines, buildErrorChains, renderErrorChainLines } from '@pagopa/go-runbook/output';

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

  const awsRegion = script.aws.clients.first.getRegion();
  const params = buildOccurrenceParams(runbook, {
    alarmName: config.alarmName,
    alarmDatetime: input.alarmDatetime,
    ...(input.alarmDatetimeEnd === undefined ? {} : { alarmDatetimeEnd: input.alarmDatetimeEnd }),
    awsRegion,
    awsProfiles: config.awsProfiles,
  });
  script.logger.info(`Time range: ${params.get('startTime') ?? ''} → ${params.get('endTime') ?? ''}`);

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

  // Both the configured entries (`reader:fallback`) and the effective names the AWS clients use (`reader`).
  const profileNames = [...config.awsProfiles, ...script.aws.clients.profileNames];
  const traceFile = await saveExecutionTrace(script, result, config.alarmName, profileNames, input.outputSuffix);
  await saveExecutionOutput(script, runbook, result, profileNames, traceFile, input.outputSuffix);
}

function renderRunbookResult(script: GOScript, result: RunbookExecutionResult): void {
  script.logger.section('Runbook Result');
  script.logger.info(`Status: ${result.status}`);
  script.logger.info(`Steps executed: ${result.stepsExecuted}`);
  script.logger.info(`Duration: ${result.durationMs}ms`);

  // Every error found, oldest first, then what the runbook could not see.
  const chains = renderErrorChainLines(buildErrorChains(result));
  if (chains.length === 0) {
    script.logger.warning('No known case matched');
  } else {
    script.logger.info('Trovati gli errori noti:');
    for (const line of chains) script.logger.info(`  - ${line}`);
  }
  for (const line of buildCoverageLines(result)) script.logger.warning(line);

  if (result.recoveredErrors.length > 0) {
    script.logger.info(`Recovered errors: ${result.recoveredErrors.length}`);
    for (const err of result.recoveredErrors) {
      script.logger.text(`  - [${err.stepId}] ${err.originalError}`);
    }
  }
}
