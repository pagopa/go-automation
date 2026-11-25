import type { lambda } from '../../../../toolkits/send/index.js';

import { LAMBDA_FUNCTION } from './knownServices.js';

/** Error signatures from Confluence v1 and the observed timeout REPORT. */
const ERROR_QUERY = `fields @timestamp, @requestId, @message
| filter @message like 'ERROR'
    or @message like /(?i)timed?\\s*out/
    or @message like /(?i)Status:\\s*timeout/
| sort @timestamp asc
| limit 1000`;

/** Reads one cloud occurrence source or all configured local sources without widening the scope. */
export const LAMBDA_LOG_READER: Omit<lambda.QueryLambdaAcrossAccountsConfig, 'queryKind'> = {
  queryProfileId: 'send',
  logGroup: LAMBDA_FUNCTION.logGroup,
  errorQuery: ERROR_QUERY,
  sources: 'configured-sources',
  labels: {
    errors: 'Query errori Lambda sulle sorgenti configurate',
    invocation: 'Query invocazione Lambda sulle sorgenti configurate',
    narrative: 'Lambda logs in configured sources',
    report: 'Log Lambda nelle sorgenti configurate',
  },
  errorVars: { checked: 'dailyExportSourcesChecked', total: 'dailyExportErrorLogCount' },
};
