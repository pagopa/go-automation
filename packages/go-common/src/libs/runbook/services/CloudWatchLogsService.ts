import type { CloudWatchLogsClient, ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { StartQueryCommand, GetQueryResultsCommand } from '@aws-sdk/client-cloudwatch-logs';
import type { TimeRange } from '../types/TimeRange.js';

/** Polling interval for CloudWatch Logs query results */
const QUERY_POLL_INTERVAL_MS = 1000;

/** Maximum polling attempts before timing out */
const MAX_POLL_ATTEMPTS = 60;

/**
 * Service for querying CloudWatch Logs Insights.
 *
 * @example
 * ```typescript
 * const service = new CloudWatchLogsService(client);
 * const results = await service.query(
 *   ['/aws/lambda/my-function'],
 *   'fields @timestamp, @message | filter @message like /ERROR/',
 *   { start: new Date('2024-01-01'), end: new Date('2024-01-02') },
 * );
 * ```
 */
export class CloudWatchLogsService {
  constructor(private readonly client: CloudWatchLogsClient) {}

  /**
   * Executes a CloudWatch Logs Insights query and waits for results.
   *
   * @param logGroups - Log group names to query
   * @param query - CloudWatch Logs Insights query string
   * @param timeRange - Time range for the query
   * @returns Array of result rows, each row being an array of ResultField
   */
  async query(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: TimeRange,
  ): Promise<ReadonlyArray<ResultField[]>> {
    const startQueryResponse = await this.client.send(
      new StartQueryCommand({
        logGroupNames: [...logGroups],
        queryString: query,
        startTime: Math.floor(timeRange.start.getTime() / 1000),
        endTime: Math.floor(timeRange.end.getTime() / 1000),
      }),
    );

    const queryId = startQueryResponse.queryId;
    if (queryId === undefined) {
      throw new Error('CloudWatch Logs query did not return a queryId');
    }

    // Poll for results
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const resultsResponse = await this.client.send(new GetQueryResultsCommand({ queryId }));

      if (
        resultsResponse.status === 'Complete' ||
        resultsResponse.status === 'Failed' ||
        resultsResponse.status === 'Cancelled'
      ) {
        if (resultsResponse.status !== 'Complete') {
          throw new Error(`CloudWatch Logs query ${resultsResponse.status}: ${queryId}`);
        }
        return resultsResponse.results ?? [];
      }

      await this.sleep(QUERY_POLL_INTERVAL_MS);
    }

    throw new Error(`CloudWatch Logs query timed out after ${MAX_POLL_ATTEMPTS} attempts: ${queryId}`);
  }

  /**
   * Sleeps for the specified milliseconds.
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
