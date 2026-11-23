import * as path from 'node:path';

import { GOHttpClient } from '@pagopa/go-common/http';
import type { GOScript } from '@go-automation/go-script';
import { type RunbookBuilderFn } from '@pagopa/go-runbook/inventory';
import { buildOccurrenceParams, createServiceRegistry, toAwsAccountsConfig } from '@pagopa/go-runbook/runtime';
import { OperationalRunbookEngine, type AwsExecutionEnvironment } from '@pagopa/go-runbook/toolkits/common';
import type { RunbookExecutionResult } from '@pagopa/go-runbook';
import { formatBytes } from '@pagopa/go-common/utils';
import {
  buildCoverageLines,
  buildErrorChains,
  type ErrorChainGroup,
  buildRunbookTelemetry,
  renderErrorChainTree,
} from '@pagopa/go-runbook/output';

import type { AnalyzableAlarmConfig } from '../types/AnalyzableAlarmConfig.js';
import { saveExecutionTrace } from './saveExecutionTrace.js';
import { saveExecutionOutput } from './saveExecutionOutput.js';
import { renderFinalSummary } from './renderFinalSummary.js';
import { ConsoleRunbookReporter } from '@pagopa/go-runbook';

// The gutter of the section and the two tree levels in front of a detail line of the known errors.
const TREE_DETAIL_MARGIN = 12;
const DEFAULT_CONSOLE_WIDTH = 120;

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
  // The chains once, for the console and the trace.
  const chains = buildErrorChains(result);
  renderRunbookResult(script, result, chains);

  // Both the configured entries (`reader:fallback`) and the effective names the AWS clients use (`reader`).
  const profileNames = [...config.awsProfiles, ...script.aws.clients.profileNames];
  // Each file only when asked: the trace can be gigabytes, the result is the essential outcome.
  const traceFile = config.outputTrace
    ? await saveExecutionTrace(script, result, chains, config.alarmName, profileNames, input.outputSuffix)
    : undefined;
  const resultFile = config.outputResult
    ? await saveExecutionOutput(script, runbook, result, profileNames, traceFile, input.outputSuffix)
    : undefined;

  const directory = traceFile ?? resultFile;
  if (directory === undefined) return;
  script.logger.section('Output');
  script.logger.fields({
    Directory: `${path.dirname(directory)}${path.sep}`,
    ...(traceFile === undefined ? {} : { Trace: path.basename(traceFile) }),
    ...(resultFile === undefined ? {} : { Result: path.basename(resultFile) }),
  });
}

function renderRunbookResult(
  script: GOScript,
  result: RunbookExecutionResult,
  groups: ReadonlyArray<ErrorChainGroup>,
): void {
  script.logger.section('Runbook Result');
  // The total of every CloudWatch Logs query of the execution, shown before the files are saved.
  const queries = buildRunbookTelemetry(result.trace)?.cloudWatchLogs;
  script.logger.fields({
    Status: result.status,
    'Steps executed': result.stepsExecuted,
    Duration: `${result.durationMs}ms`,
    ...(queries === undefined
      ? {}
      : {
          // A failed read has no statistics: it is counted apart and adds no bytes.
          'CloudWatch queries':
            queries.failedQueryCount === undefined
              ? queries.queryCount
              : `${String(queries.queryCount)} (${String(queries.failedQueryCount)} ${queries.failedQueryCount === 1 ? 'fallita' : 'fallite'})`,
          'Bytes scanned': `${String(queries.statistics.bytesScanned)} (${formatBytes(queries.statistics.bytesScanned)})`,
          'Records scanned': queries.statistics.recordsScanned,
          'Records matched': queries.statistics.recordsMatched,
        }),
  });

  // Every error found, oldest first, then what the runbook could not see.
  const chains = renderErrorChainTree(groups, {
    maxDetailLength: consoleWidth() - TREE_DETAIL_MARGIN,
  });
  if (chains.length === 0) {
    script.logger.warning('No known case matched');
  } else {
    script.logger.newline();
    script.logger.info(`Trovati gli errori noti (${String(chains.length)}):`);
    script.logger.tree(chains);
  }
  for (const line of buildCoverageLines(result)) script.logger.warning(line);

  if (result.recoveredErrors.length > 0) {
    script.logger.info(`Recovered errors: ${result.recoveredErrors.length}`);
    script.logger.tree(result.recoveredErrors.map((err) => ({ label: `[${err.stepId}] ${err.originalError}` })));
  }
}

/** Columns of the terminal, or a fixed width when the output is not a terminal (CI, pipe, file). */
function consoleWidth(): number {
  return process.stdout.isTTY && process.stdout.columns > 0 ? process.stdout.columns : DEFAULT_CONSOLE_WIDTH;
}
