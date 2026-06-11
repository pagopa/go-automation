import { RunbookBuilder } from '../../builders/RunbookBuilder.js';
import { CloudWatchLogsQueryStep } from '../../steps/data/CloudWatchLogsQueryStep.js';
import type { TimeRangeFromParams } from '../../steps/data/TimeRangeFromParams.js';
import type { Runbook } from '../../types/Runbook.js';

import type { LambdaAlarmConfig } from '../types/LambdaAlarmConfig.js';
import { PrepareLambdaSectionStep } from '../steps/PrepareLambdaSectionStep.js';
import { ParseLambdaErrorsStep } from '../steps/ParseLambdaErrorsStep.js';
import { QueryLambdaInvocationStep } from '../steps/QueryLambdaInvocationStep.js';
import { AnalyzeLambdaInvocationStep } from '../steps/AnalyzeLambdaInvocationStep.js';
import { QueryDownstreamLogsStep } from '../steps/QueryDownstreamLogsStep.js';
import { resolveLambdaAlarmBuildContext } from './resolveLambdaAlarmBuildContext.js';
import { defaultLambdaUnknownCaseFallback } from './defaultUnknownCaseFallback.js';

const TIME_RANGE: TimeRangeFromParams = { start: 'startTime', end: 'endTime' };

/**
 * Assembles a complete Lambda alarm runbook from declarative inputs.
 * Mirrors `apigw.createApiGwAlarmRunbook` but with a flat pipeline (no
 * recursive URL graph): the downstream loop is a single pass over the
 * declared downstreams.
 *
 * @param config - The Lambda alarm configuration
 * @returns A validated {@link Runbook} ready for the engine
 */
export function createLambdaAlarmRunbook(config: LambdaAlarmConfig): Runbook {
  const ctx = resolveLambdaAlarmBuildContext(config);
  const builder = RunbookBuilder.create(config.id).metadata(config.metadata);

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

  // 3. Parse / classify / route to downstream.
  builder.step(
    new ParseLambdaErrorsStep({
      id: 'parse-lambda-errors',
      label: 'Analisi errori Lambda',
      fromStep: 'query-lambda-errors',
      downstreamErrorPatterns: ctx.downstreamErrorPatterns,
    }),
    { silent: true },
  );

  // 4. Reconstruct the invocation flow for the requestId.
  builder.step(
    new QueryLambdaInvocationStep({
      id: 'query-lambda-invocation',
      label: 'Ricostruzione flusso per requestId',
      lambdaLogGroup: config.lambda.logGroup,
      queryTemplate: ctx.profile.invocationQueryTemplate,
      timeRangeFromParams: TIME_RANGE,
    }),
    { silent: true },
  );

  // 4b. Refine downstream routing from the full invocation flow (the routing
  // signal may appear only in the reconstructed flow, not in the error scan).
  builder.step(
    new AnalyzeLambdaInvocationStep({
      id: 'analyze-lambda-invocation',
      label: 'Analisi flusso invocazione',
      fromStep: 'query-lambda-invocation',
      downstreamErrorPatterns: ctx.downstreamErrorPatterns,
    }),
    { silent: true },
  );

  // 5. Custom pre-steps.
  for (const descriptor of ctx.preSteps) {
    const opts: { continueOnFailure?: boolean; silent?: boolean } = {};
    if (descriptor.continueOnFailure === true) opts.continueOnFailure = true;
    if (descriptor.silent === true) opts.silent = true;
    builder.step(descriptor.step, opts);
  }

  // 6. Per-downstream query (no-op unless routed there).
  for (const downstream of ctx.downstreams) {
    builder.step(
      new QueryDownstreamLogsStep({
        id: `query-${downstream.name}`,
        label: `Query log ${downstream.name}`,
        downstream,
        queryTemplate: ctx.profile.invocationQueryTemplate,
        timeRangeFromParams: TIME_RANGE,
      }),
      { silent: true },
    );
  }

  // 7. Known cases declared by the runbook.
  for (const knownCase of config.knownCases) {
    builder.knownCase(knownCase);
  }

  // 8. Fallback + structured context.
  builder.fallback(config.fallbackAction ?? defaultLambdaUnknownCaseFallback(ctx.downstreams));
  builder.runbookContext({ ...ctx.runbookContext });

  if (config.maxIterations !== undefined) {
    builder.maxIterations(config.maxIterations);
  }

  return builder.build();
}
