import type { CloudWatchLogsClient, ResultField } from '@aws-sdk/client-cloudwatch-logs';
import {
  StartQueryCommand,
  GetQueryResultsCommand,
  CloudWatchLogsServiceException,
} from '@aws-sdk/client-cloudwatch-logs';
import type { TimeRange } from '../types/TimeRange.js';
import { pollUntilComplete, exponentialBackoff } from '../../core/utils/pollUntilComplete.js';
import type { PollOptions } from '../../core/utils/pollUntilComplete.js';

/** All terminal statuses for CloudWatch Logs Insights queries */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['Complete', 'Failed', 'Cancelled', 'Timeout']);

/**
 * Checks whether a CloudWatch Logs query status is terminal.
 *
 * @param status - Query status string from AWS
 * @returns true if the status is terminal
 */
function isTerminalStatus(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status);
}

/**
 * Options for a CloudWatch Logs Insights query.
 * @public
 */
export interface CloudWatchLogsQueryOptions {
  /** Abort signal to cancel the query */
  readonly signal?: AbortSignal;
  /** Override max poll attempts */
  readonly maxPollAttempts?: number;
  /** Override poll backoff strategy */
  readonly pollBackoff?: PollOptions['backoff'];
  /** Sleep implementation — injectable for testing */
  readonly sleepFn?: (ms: number) => Promise<void>;
  /** Called after each non-terminal polling attempt */
  readonly onPollAttempt?: PollOptions['onAttempt'];
}

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
   * @param logGroups - Log group names to query (must not be empty)
   * @param query - CloudWatch Logs Insights query string (must not be empty)
   * @param timeRange - Time range for the query (end must be after start)
   * @param options - Optional polling and cancellation options
   * @returns Array of result rows, each row being a readonly array of ResultField
   */
  async query(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: TimeRange,
    options?: CloudWatchLogsQueryOptions,
  ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
    this.validateInput(logGroups, query, timeRange);

    const queryId = await this.startQuery(logGroups, query, timeRange, options?.signal);

    const pollOptions = {
      ...(options?.maxPollAttempts !== undefined ? { maxAttempts: options.maxPollAttempts } : {}),
      backoff: options?.pollBackoff ?? exponentialBackoff(),
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      ...(options?.sleepFn !== undefined ? { sleepFn: options.sleepFn } : {}),
      ...(options?.onPollAttempt !== undefined ? { onAttempt: options.onPollAttempt } : {}),
    };

    return pollUntilComplete(pollOptions, async () => {
      let response;
      try {
        response = await this.client.send(new GetQueryResultsCommand({ queryId }));
      } catch (error: unknown) {
        throw this.wrapAwsError('GetQueryResults', queryId, error);
      }

      if (isTerminalStatus(response.status)) {
        if (response.status !== 'Complete') {
          throw new Error(`CloudWatch Logs query ${response.status}: ${queryId}`);
        }
        return (response.results ?? []) as ReadonlyArray<ReadonlyArray<ResultField>>;
      }

      return undefined;
    });
  }

  /**
   * Validates query inputs before sending to AWS.
   */
  private validateInput(logGroups: ReadonlyArray<string>, query: string, timeRange: TimeRange): void {
    if (logGroups.length === 0) {
      throw new Error('CloudWatch Logs query requires at least one log group');
    }
    if (query.trim() === '') {
      throw new Error('CloudWatch Logs query string cannot be empty');
    }
    if (timeRange.end <= timeRange.start) {
      throw new Error(
        `Invalid time range: end (${timeRange.end.toISOString()}) must be after start (${timeRange.start.toISOString()})`,
      );
    }
  }

  /**
   * Starts a CloudWatch Logs Insights query and returns the query ID.
   */
  private async startQuery(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: TimeRange,
    signal?: AbortSignal,
  ): Promise<string> {
    if (signal?.aborted === true) {
      throw new Error('CloudWatch Logs query aborted before start');
    }

    let startQueryResponse;
    try {
      startQueryResponse = await this.client.send(
        new StartQueryCommand({
          logGroupNames: [...logGroups],
          queryString: query,
          startTime: Math.floor(timeRange.start.getTime() / 1000),
          endTime: Math.floor(timeRange.end.getTime() / 1000),
        }),
      );
    } catch (error: unknown) {
      throw this.wrapAwsError('StartQuery', undefined, error);
    }

    const queryId = startQueryResponse.queryId;
    if (queryId === undefined) {
      throw new Error('CloudWatch Logs query did not return a queryId');
    }

    return queryId;
  }

  /**
   * Wraps AWS SDK errors with contextual information.
   *
   * @param operation - AWS operation name
   * @param queryId - Query ID if available
   * @param error - Original error
   * @returns Wrapped Error with cause chain
   */
  private wrapAwsError(operation: string, queryId: string | undefined, error: unknown): Error {
    const idSuffix = queryId !== undefined ? ` (queryId: ${queryId})` : '';

    if (error instanceof CloudWatchLogsServiceException) {
      return new Error(`CloudWatch Logs ${operation} failed: [${error.name}] ${error.message}${idSuffix}`, {
        cause: error,
      });
    }

    return new Error(
      `CloudWatch Logs ${operation} failed: ${error instanceof Error ? error.message : String(error)}${idSuffix}`,
      { cause: error },
    );
  }
}
