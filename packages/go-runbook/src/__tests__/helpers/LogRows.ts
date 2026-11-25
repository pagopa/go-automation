import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

/** Rows of a Logs Insights query, as the query steps and the stubs return them. */
export type LogRows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
