export const SPIDHUB_ALARM = 'spidhub-prod-ExternalELBAlarm';
export const SPIDHUB_LOG_GROUP = 'spidhub-prod-hub-login';
export const SPIDHUB_ACCOUNT_ID = '350578575906';
export const SPIDHUB_REGION = 'eu-south-1';
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
