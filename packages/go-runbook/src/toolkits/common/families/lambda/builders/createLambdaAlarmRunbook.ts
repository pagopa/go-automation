import { AlarmRunbookBuilder } from '../../../builders/AlarmRunbookBuilder.js';
import { CloudWatchLogsQueryStep } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';

import type { LambdaAlarmConfig } from '../types/LambdaAlarmConfig.js';
import { PrepareLambdaSectionStep } from '../steps/PrepareLambdaSectionStep.js';
import { ParseLambdaErrorsStep } from '../steps/ParseLambdaErrorsStep.js';
import { QueryLambdaInvocationStep } from '../steps/QueryLambdaInvocationStep.js';
import { AnalyzeLambdaInvocationStep } from '../steps/AnalyzeLambdaInvocationStep.js';
import { DescendToLambdaDownstreamStep } from '../tree/DescendToLambdaDownstreamStep.js';
import { LambdaDownstreamLevelReader } from '../tree/LambdaDownstreamLevelReader.js';
import { enumerateLambdaDownstreamErrors } from '../tree/enumerateLambdaDownstreamErrors.js';
import { enumerateLambdaInvocations } from '../tree/enumerateLambdaInvocations.js';
import { lambdaRowRequestId } from '../helpers/lambdaRowRequestId.js';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { StepDescriptor } from '../../../../../engine/types/StepDescriptor.js';
import type { TreeLevel } from '../../../../../engine/types/TreeLevel.js';
import { resolveLambdaAlarmBuildContext } from './resolveLambdaAlarmBuildContext.js';
import { defaultLambdaUnknownCaseFallback } from './defaultLambdaUnknownCaseFallback.js';
import { finishAlarmRunbook } from '../../../builders/finishAlarmRunbook.js';
import type { LambdaPipelineAnchor } from '../types/LambdaPipelineAnchor.js';

const TIME_RANGE: TimeRangeFromParams = { start: 'startTime', end: 'endTime' };

/** A Logs Insights row. */
type LogRow = ReadonlyArray<GOLogsInsightsResultField>;

/**
 * Assembles a complete Lambda alarm runbook from declarative inputs.
 * Mirrors `apigw.createSendApiGwAlarmRunbook` but with a flat pipeline (no
 * recursive URL graph): the downstream loop is a single pass over the
 * declared downstreams.
 *
 * @param config - The Lambda alarm configuration
 * @returns A validated {@link Runbook} ready for the engine
 */
export function createLambdaAlarmRunbook(config: LambdaAlarmConfig): Runbook {
  if (config.errorQueryStep !== undefined && config.errorQueryStep.id !== 'query-lambda-errors') {
    throw new Error('createLambdaAlarmRunbook: errorQueryStep must use id "query-lambda-errors"');
  }
  if (config.invocationQueryStep !== undefined && config.invocationQueryStep.id !== 'query-lambda-invocation') {
    throw new Error('createLambdaAlarmRunbook: invocationQueryStep must use id "query-lambda-invocation"');
  }
  const ctx = resolveLambdaAlarmBuildContext(config);
  const reachedAnchors = new Set<LambdaPipelineAnchor>();
  const builder = AlarmRunbookBuilder.create(config.id)
    .metadata(config.metadata)
    .cloudExecutionPolicy({ sideEffects: 'NONE' });

  // 1. Banner + seed canonical lambda vars.
  builder.step(
    new PrepareLambdaSectionStep({
      id: 'prepare-lambda-section',
      label: 'Preparazione Lambda',
      lambdaName: config.lambda.name,
      logGroup: config.lambda.logGroup,
      ...(config.lambda.eventSource !== undefined ? { eventSource: config.lambda.eventSource } : {}),
      ...(config.lambda.configuredTimeoutMs !== undefined
        ? { configuredTimeoutMs: config.lambda.configuredTimeoutMs }
        : {}),
    }),
    { silent: true },
  );

  // 2. Error scan on the Lambda log group.
  builder.step(
    config.errorQueryStep ??
      new CloudWatchLogsQueryStep({
        id: 'query-lambda-errors',
        label: 'Query log Lambda per errori',
        logGroups: [config.lambda.logGroup],
        query: ctx.profile.errorQuery,
        timeRangeFromParams: TIME_RANGE,
        logGroupResolutionMode: 'search-configured-profiles',
        traceMetadata: { queryProfileId: ctx.profile.id, queryKind: 'lambda-error-scan' },
      }),
    { silent: true },
  );

  // 3. Reconstruct the flow of every invocation in error, a batch of request ids per query.
  builder.step(
    config.invocationQueryStep ??
      new QueryLambdaInvocationStep({
        id: 'query-lambda-invocation',
        label: 'Ricostruzione flusso per requestId',
        lambdaLogGroup: config.lambda.logGroup,
        queryTemplate: ctx.profile.invocationQueryTemplate,
        timeRangeFromParams: TIME_RANGE,
      }),
    { silent: true },
  );

  // 4. Root level: one node per invocation in error, classified, enriched by its flow, then routed to a downstream.
  const invocationSteps: StepDescriptor[] = [
    {
      step: new ParseLambdaErrorsStep({
        id: 'parse-lambda-errors',
        label: 'Analisi errori Lambda',
        fromStep: 'query-lambda-errors',
        downstreamErrorPatterns: ctx.downstreamErrorPatterns,
        downstreamSignatures: ctx.profile.downstreamSignatures,
      }),
      silent: true,
    },
    {
      // The routing signal may appear only in the reconstructed flow, not in the error scan.
      step: new AnalyzeLambdaInvocationStep({
        id: 'analyze-lambda-invocation',
        label: 'Analisi flusso invocazione',
        fromStep: 'query-lambda-invocation',
        downstreamErrorPatterns: ctx.downstreamErrorPatterns,
      }),
      silent: true,
    },
  ];
  reachedAnchors.add('before-downstream-queries');
  invocationSteps.push(...ctx.hooks.filter((hook) => hook.at === 'before-downstream-queries'));

  // 5. One level per downstream with logs: its errors for each invocation routed there, read for all at once.
  const readable = ctx.downstreams.flatMap((downstream) =>
    downstream.logGroup === undefined ? [] : [{ ...downstream, logGroup: downstream.logGroup }],
  );
  invocationSteps.push({
    step: new DescendToLambdaDownstreamStep('descend-lambda', new Set(readable.map(({ name }) => name))),
    silent: true,
  });
  const downstreamLevels = readable.map((downstream): TreeLevel => {
    const readStepId = `query-${downstream.name}`;
    const errorVar = `${downstream.varPrefix}ErrorMsg`;
    return {
      target: downstream.name,
      varPrefix: downstream.varPrefix,
      read: new LambdaDownstreamLevelReader({
        id: readStepId,
        label: `Query log ${downstream.name}`,
        downstream,
        queryTemplate: ctx.profile.invocationQueryTemplate,
        timeRangeFromParams: TIME_RANGE,
      }),
      attribute: (row, identifier) => Array.isArray(row) && lambdaRowRequestId(row as LogRow) === identifier.value,
      enumerate: enumerateLambdaDownstreamErrors(readStepId, downstream.varPrefix),
      ownsVar: (name) => name === errorVar,
    };
  });

  builder.errorTree({
    root: {
      target: 'lambda',
      scopedSteps: ['query-lambda-errors', 'query-lambda-invocation'],
      enumerate: enumerateLambdaInvocations({
        errorsStepId: 'query-lambda-errors',
        invocationStepId: 'query-lambda-invocation',
      }),
      perNode: invocationSteps,
    },
    levels: downstreamLevels,
  });

  // 7. Known cases, fallback, context, analysis defaults, iteration cap, build.
  return finishAlarmRunbook(builder, config, {
    builderName: 'createLambdaAlarmRunbook',
    defaultFallback: () => defaultLambdaUnknownCaseFallback(ctx.downstreams),
    runbookContext: { ...ctx.runbookContext },
    primaryResource: config.lambda.name,
    anchors: { hooks: ctx.hooks, reached: reachedAnchors, pipelineName: 'Lambda' },
  });
}
