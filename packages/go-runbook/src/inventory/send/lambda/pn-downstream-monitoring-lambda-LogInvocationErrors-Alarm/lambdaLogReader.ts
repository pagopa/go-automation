import { lambda, SEND_PRODUCTION_ACCOUNTS, SEND_PRODUCTION_REGION } from '../../../../toolkits/send/index.js';

import { LAMBDA_FUNCTION } from './knownServices.js';

/** Source q1, with the additional runtime signatures suggested in its comments. */
const BOTH_ACCOUNTS_ERROR_QUERY = `fields @timestamp, @xrayTraceId, @requestId, @message
| filter @message like 'ERROR'
    or @message like /(?i)Invoke Error/
    or @message like /(?i)timed?\\s*out/
    or @message like /(?i)OutOfMemory/
    or @message like /(?i)Runtime exited with error:\\s*signal:\\s*killed/
    or @message like /(?i)fatal/
    or @message like /(?i)Status:\\s*error/
| sort @timestamp asc
| limit 1000`;

/**
 * Reads the Lambda in both production accounts independently, failing if either
 * cannot be checked; in cloud execution the account without a profile is read through OAM.
 */
export const LAMBDA_LOG_READER: Omit<lambda.QueryLambdaAcrossAccountsConfig, 'queryKind'> = {
  queryProfileId: 'send',
  logGroup: LAMBDA_FUNCTION.logGroup,
  errorQuery: BOTH_ACCOUNTS_ERROR_QUERY,
  sources: {
    subject: 'pn-downstream-monitoring-lambda',
    accounts: SEND_PRODUCTION_ACCOUNTS,
    scope: 'every-account',
    defaultRegion: SEND_PRODUCTION_REGION,
  },
  labels: {
    errors: 'Query errori Lambda core e confinfo',
    invocation: 'Query invocazione Lambda core e confinfo',
    narrative: 'Lambda logs in core and confinfo',
    report: 'Log Lambda verificati in core e confinfo',
  },
  errorVars: {
    checked: 'downstreamMonitoringAccountsChecked',
    bySource: {
      core: 'downstreamMonitoringCoreErrorLogCount',
      confinfo: 'downstreamMonitoringConfinfoErrorLogCount',
    },
  },
};
