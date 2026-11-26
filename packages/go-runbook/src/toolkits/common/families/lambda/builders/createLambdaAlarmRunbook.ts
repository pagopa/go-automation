import { startAlarmRunbook } from '../../../builders/startAlarmRunbook.js';
import { CloudWatchLogsQueryStep } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import { ALARM_TIME_RANGE } from '../../../time/ALARM_TIME_RANGE.js';
import type { Runbook, StepDescriptor, TreeLevel } from '../../../../../engine/index.js';
import { pipelineHooksAt } from '../../../../../engine/internal.js';

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
import { resolveLambdaAlarmBuildContext } from './resolveLambdaAlarmBuildContext.js';
import { defaultLambdaUnknownCaseFallback } from './defaultLambdaUnknownCaseFallback.js';
import { finishAlarmRunbook } from '../../../builders/finishAlarmRunbook.js';
import type { LambdaPipelineAnchor } from '../types/LambdaPipelineAnchor.js';
import { LAMBDA_PIPELINE_STEP_IDS as STEP_IDS } from './LAMBDA_PIPELINE_STEP_IDS.js';
import { lambdaDownstreamReadStepId } from './lambdaDownstreamReadStepId.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
import { logRowIdentity } from '../../../steps/aws/cloudwatch-logs/logRowIdentity.js';

/**
 * Assembles a complete Lambda alarm runbook from declarative inputs: the error scan and the reconstructed flow of
 * the invocations in error, then an error tree with one node per invocation and one level per downstream with a log
 * group, read for every invocation routed there.
 *
 * @param config - The Lambda alarm configuration
 * @returns A validated {@link Runbook} ready for the engine
 */
export function createLambdaAlarmRunbook(config: LambdaAlarmConfig): Runbook {
  if (config.errorQueryStep !== undefined && config.errorQueryStep.id !== STEP_IDS.errors) {
    throw new Error(`createLambdaAlarmRunbook: errorQueryStep must use id "${STEP_IDS.errors}"`);
  }
  if (config.invocationQueryStep !== undefined && config.invocationQueryStep.id !== STEP_IDS.invocation) {
    throw new Error(`createLambdaAlarmRunbook: invocationQueryStep must use id "${STEP_IDS.invocation}"`);
  }
  const ctx = resolveLambdaAlarmBuildContext(config);
  const reachedAnchors = new Set<LambdaPipelineAnchor>();
  const builder = startAlarmRunbook(config);

  // 1. Banner + seed canonical lambda vars.
  builder.step(
    new PrepareLambdaSectionStep({
      id: STEP_IDS.prepare,
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
        id: STEP_IDS.errors,
        label: 'Query log Lambda per errori',
        logGroups: [config.lambda.logGroup],
        query: ctx.profile.errorQuery,
        timeRangeFromParams: ALARM_TIME_RANGE,
        logGroupResolutionMode: 'search-configured-profiles',
        traceMetadata: { queryProfileId: ctx.profile.id, queryKind: 'lambda-error-scan' },
      }),
    { silent: true },
  );

  // 3. Reconstruct the flow of every invocation in error, a batch of request ids per query.
  builder.step(
    config.invocationQueryStep ??
      new QueryLambdaInvocationStep({
        id: STEP_IDS.invocation,
        label: 'Ricostruzione flusso per requestId',
        lambdaLogGroup: config.lambda.logGroup,
        queryTemplate: ctx.profile.invocationQueryTemplate,
        timeRangeFromParams: ALARM_TIME_RANGE,
      }),
    { silent: true },
  );

  // 4. Root level: one node per invocation in error, classified, enriched by its flow, then routed to a downstream.
  const invocationSteps: StepDescriptor[] = [
    {
      step: new ParseLambdaErrorsStep({
        id: STEP_IDS.parse,
        label: 'Analisi errori Lambda',
        fromStep: STEP_IDS.errors,
        downstreamErrorPatterns: ctx.downstreamErrorPatterns,
        downstreamSignatures: ctx.profile.downstreamSignatures,
      }),
      silent: true,
    },
    {
      // The routing signal may appear only in the reconstructed flow, not in the error scan.
      step: new AnalyzeLambdaInvocationStep({
        id: STEP_IDS.analyze,
        label: 'Analisi flusso invocazione',
        fromStep: STEP_IDS.invocation,
        downstreamErrorPatterns: ctx.downstreamErrorPatterns,
      }),
      silent: true,
    },
  ];
  invocationSteps.push(...pipelineHooksAt(ctx.hooks, 'before-downstream-queries', reachedAnchors));

  // 5. One level per downstream with logs: its errors for each invocation routed there, read for all at once.
  const readable = ctx.downstreams.flatMap((downstream) =>
    downstream.logGroup === undefined ? [] : [{ ...downstream, logGroup: downstream.logGroup }],
  );
  invocationSteps.push({
    step: new DescendToLambdaDownstreamStep(STEP_IDS.descend, new Set(readable.map(({ name }) => name))),
    silent: true,
  });
  const downstreamLevels = readable.map((downstream): TreeLevel => {
    const readStepId = lambdaDownstreamReadStepId(downstream.name);
    const errorVar = `${downstream.varPrefix}ErrorMsg`;
    return {
      target: downstream.name,
      varPrefix: downstream.varPrefix,
      read: new LambdaDownstreamLevelReader({
        id: readStepId,
        label: `Query log ${downstream.name}`,
        downstream,
        queryTemplate: ctx.profile.invocationQueryTemplate,
        timeRangeFromParams: ALARM_TIME_RANGE,
      }),
      attribute: (identifier) => (row) =>
        Array.isArray(row) && lambdaRowRequestId(row as CloudWatchLogsRow) === identifier.value,
      // The same log event read by two attempts or two parents is one row.
      rowIdentity: logRowIdentity,
      enumerate: enumerateLambdaDownstreamErrors(readStepId, downstream.varPrefix),
      ownsVar: (name) => name === errorVar,
    };
  });

  builder.errorTree({
    root: {
      target: 'lambda',
      scopedSteps: [STEP_IDS.errors, STEP_IDS.invocation],
      enumerate: enumerateLambdaInvocations({ errorsStepId: STEP_IDS.errors, invocationStepId: STEP_IDS.invocation }),
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
