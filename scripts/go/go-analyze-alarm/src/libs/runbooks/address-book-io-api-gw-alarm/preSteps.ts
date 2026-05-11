/**
 * Custom pre-steps inserted before the standard per-service pipeline of
 * the pn-address-book-io-IO-ApiGwAlarm runbook.
 *
 * The probe targets the `pn-ioAuthorizerLambda` log group looking for
 * REPORT lines whose duration crossed the 5s lambda timeout. The result
 * feeds the `io-authorizer-lambda-timeout` known case.
 */

import { queryCloudWatchLogs, apigw } from '@go-automation/go-runbook';
import type { StepDescriptor } from '@go-automation/go-runbook';

import { IO_AUTHORIZER_LAMBDA_LOG_GROUP } from './constants.js';

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
  },
  {
    step: apigw.analyzeServiceLogs({
      id: 'analyze-io-authorizer-lambda',
      label: 'Analisi log pn-ioAuthorizerLambda',
      fromStep: 'query-io-authorizer-lambda',
      varPrefix: 'ioAuthorizerLambda',
    }),
    continueOnFailure: true,
  },
];
