import { SEND_CONFINFO_PROD_ACCOUNT, SEND_PRODUCTION_REGION } from '../../../../toolkits/send/index.js';

export const SPIDHUB_ALARM = 'spidhub-prod-ExternalELBAlarm';
export const SPIDHUB_LOG_GROUP = 'spidhub-prod-hub-login';
/** SPID hub runs in the SEND confinfo production account. */
export const SPIDHUB_ACCOUNT_ID: string = SEND_CONFINFO_PROD_ACCOUNT.accountId;
export const SPIDHUB_REGION: string = SEND_PRODUCTION_REGION;
export const RUNBOOK_URL = 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3377573008/spidhub-prod-ExternalELBAlarm';

export const ROW_LIMIT = 1000;
export const ERROR_QUERY: string = `fields @timestamp, @logStream, @message
| filter @message like /(?i)\\b(error|fatal)\\b/
| sort @timestamp asc
| limit ${ROW_LIMIT}`;

export const STREAM_QUERY: string = `stats min(@timestamp) as firstLog, max(@timestamp) as lastLog,
    count(*) as logCount by @logStream
| sort lastLog desc
| limit ${ROW_LIMIT}`;
