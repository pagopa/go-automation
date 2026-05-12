/**
 * Custom pre-steps inserted before the standard per-service pipeline of
 * the pn-address-book-io-IO-ApiGwAlarm runbook.
 *
 * The probe targets the `pn-ioAuthorizerLambda` log group looking for
 * REPORT lines whose duration crossed the 5s lambda timeout. The result
 * feeds the `io-authorizer-lambda-timeout` known case.
 *
 * Both pre-steps are marked `silent` so the engine does not emit its
 * default `[step.id] step.label` line on stdout, and the analyze step
 * is configured with `quiet: true` so it does not call into the
 * {@link apigw.ApiGwReporter} (the probe lives outside the per-service
 * section narrative and its findings would dangle visually).
 */

import { queryCloudWatchLogs, apigw } from '@go-automation/go-runbook';
import type { StepDescriptor } from '@go-automation/go-runbook';

import { IO_AUTHORIZER_LAMBDA_LOG_GROUP } from './constants.js';

/**
 * The Lambda authorizer probe has no URL-related concerns: we instantiate
 * an empty {@link apigw.KnownUrlsRegistry} so the analysis step can still
 * run unchanged. The probe does not feed the dynamic loop — its purpose
 * is only to set `ioAuthorizerLambdaErrorMsg` for the known cases.
 */
const EMPTY_URL_REGISTRY = new apigw.KnownUrlsRegistry([]);

export const IO_AUTHORIZER_PRE_STEPS: ReadonlyArray<StepDescriptor> = [
  {
    step: queryCloudWatchLogs({
      id: 'query-io-authorizer-lambda',
      label: 'Query log pn-ioAuthorizerLambda (Livello 0)',
      logGroups: [IO_AUTHORIZER_LAMBDA_LOG_GROUP],
      query: `
        fields @timestamp, @message, @duration, @billedDuration
        | filter @message like 'REPORT'
        | filter @duration >= 5000
        | sort @timestamp desc
        | limit 100
      `,
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    }),
    continueOnFailure: true,
    silent: true,
  },
  {
    step: apigw.analyzeServiceLogs({
      id: 'analyze-io-authorizer-lambda',
      label: 'Analisi log pn-ioAuthorizerLambda',
      fromStep: 'query-io-authorizer-lambda',
      varPrefix: 'ioAuthorizerLambda',
      registry: EMPTY_URL_REGISTRY,
      quiet: true,
    }),
    continueOnFailure: true,
    silent: true,
  },
];
