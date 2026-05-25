import type { CloudWatchLogsClient, ResultField } from '@aws-sdk/client-cloudwatch-logs';
import {
  CloudWatchLogsServiceException,
  GetQueryResultsCommand,
  StartQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { GOPoller, GOPollingPolicies } from '../core/polling/index.js';

import type { AWSMultiClientProvider } from './AWSMultiClientProvider.js';

/** Non-success terminal statuses for CloudWatch Logs Insights queries (Complete handled separately). */
const FAILURE_STATUSES: ReadonlySet<string> = new Set(['Failed', 'Cancelled', 'Timeout']);

const RECOVERABLE_PROFILE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AccessDeniedException',
  'ExpiredTokenException',
  'InvalidClientTokenId',
  'ResourceNotFoundException',
  'UnrecognizedClientException',
]);

export type AWSCloudWatchLogsLogGroupResolutionMode = 'default-profile-only' | 'search-configured-profiles';

export interface AWSCloudWatchLogsTimeRange {
  readonly start: Date;
  readonly end: Date;
}

export interface AWSCloudWatchLogsQueryOptions {
  /** Abort signal to cancel the query. */
  readonly signal?: AbortSignal;
  /** Override max poll attempts (default from `GOPollingPolicies.cloudWatchLogsQuery()`). */
  readonly maxPollAttempts?: number;
  /**
   * Log group resolution strategy.
   *
   * - `default-profile-only`: query only the first configured profile.
   * - `search-configured-profiles`: try configured profiles in order until
   *   the log group can be queried, caching successful resolutions.
   */
  readonly logGroupResolutionMode?: AWSCloudWatchLogsLogGroupResolutionMode;
}

interface ProfileAttemptError {
  readonly profile: string;
  readonly error: Error;
}

/**
 * CloudWatch Logs Insights service backed by {@link AWSMultiClientProvider}.
 *
 * The default behaviour is conservative and uses the first configured
 * profile only. Callers that need cross-account log group discovery can
 * opt into `search-configured-profiles` per query.
 */
export class AWSCloudWatchLogsService {
  private readonly logGroupProfileCache = new Map<string, string>();

  constructor(private readonly clientProvider: AWSMultiClientProvider) {}

  async query(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options: AWSCloudWatchLogsQueryOptions = {},
  ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
    this.validateInput(logGroups, query, timeRange);

    const mode = options.logGroupResolutionMode ?? 'default-profile-only';
    if (mode === 'default-profile-only') {
      return this.queryWithProfile(this.clientProvider.first.getProfile(), logGroups, query, timeRange, options);
    }

    const results: ReadonlyArray<ReadonlyArray<ResultField>>[] = [];
    for (const logGroup of logGroups) {
      results.push(await this.queryLogGroupAcrossProfiles(logGroup, query, timeRange, options));
    }

    return sortRowsByTimestamp(results.flat());
  }

  clearLogGroupResolutionCache(): void {
    this.logGroupProfileCache.clear();
  }

  private async queryLogGroupAcrossProfiles(
    logGroup: string,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options: AWSCloudWatchLogsQueryOptions,
  ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
    const attempts: ProfileAttemptError[] = [];
    const candidateProfiles = this.buildCandidateProfiles(logGroup);

    for (const profile of candidateProfiles) {
      try {
        const result = await this.queryWithProfile(profile, [logGroup], query, timeRange, options);
        this.logGroupProfileCache.set(logGroup, profile);
        return result;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        attempts.push({ profile, error: err });
        if (!isRecoverableProfileSearchError(err)) {
          throw err;
        }
      }
    }

    throw buildProfileResolutionError(logGroup, attempts);
  }

  private buildCandidateProfiles(logGroup: string): ReadonlyArray<string> {
    const cached = this.logGroupProfileCache.get(logGroup);
    if (cached === undefined) {
      return this.clientProvider.profileNames;
    }

    return [cached, ...this.clientProvider.profileNames.filter((profile) => profile !== cached)];
  }

  private async queryWithProfile(
    profile: string,
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options: AWSCloudWatchLogsQueryOptions,
  ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
    const client = this.clientProvider.getClientProvider(profile).cloudWatchLogs;
    const queryId = await this.startQuery(client, profile, logGroups, query, timeRange, options.signal);

    const poller = new GOPoller({
      ...GOPollingPolicies.cloudWatchLogsQuery(),
      ...(options.maxPollAttempts !== undefined ? { maxAttempts: options.maxPollAttempts } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });

    return poller.poll<ReadonlyArray<ReadonlyArray<ResultField>>>(async () => {
      let response;
      try {
        response = await client.send(new GetQueryResultsCommand({ queryId }));
      } catch (error: unknown) {
        throw this.wrapAwsError('GetQueryResults', profile, queryId, error);
      }

      const status = response.status;
      if (status === 'Complete') {
        return { type: 'success', value: response.results ?? [] };
      }
      if (status !== undefined && FAILURE_STATUSES.has(status)) {
        return {
          type: 'failure',
          error: new Error(`CloudWatch Logs query ${status}: ${queryId} (profile: ${profile})`),
          reason: status,
        };
      }
      // Scheduled | Running | Unknown → continue.
      return { type: 'continue', ...(status !== undefined ? { reason: status } : {}) };
    });
  }

  private validateInput(logGroups: ReadonlyArray<string>, query: string, timeRange: AWSCloudWatchLogsTimeRange): void {
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

  private async startQuery(
    client: CloudWatchLogsClient,
    profile: string,
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    signal?: AbortSignal,
  ): Promise<string> {
    if (signal?.aborted === true) {
      throw new Error('CloudWatch Logs query aborted before start');
    }

    let startQueryResponse;
    try {
      startQueryResponse = await client.send(
        new StartQueryCommand({
          logGroupNames: [...logGroups],
          queryString: query,
          startTime: Math.floor(timeRange.start.getTime() / 1000),
          endTime: Math.floor(timeRange.end.getTime() / 1000),
        }),
      );
    } catch (error: unknown) {
      throw this.wrapAwsError('StartQuery', profile, undefined, error);
    }

    const queryId = startQueryResponse.queryId;
    if (queryId === undefined) {
      throw new Error(`CloudWatch Logs query did not return a queryId (profile: ${profile})`);
    }

    return queryId;
  }

  private wrapAwsError(operation: string, profile: string, queryId: string | undefined, error: unknown): Error {
    const idSuffix = queryId !== undefined ? ` (queryId: ${queryId})` : '';
    const profileSuffix = ` (profile: ${profile})`;

    if (error instanceof CloudWatchLogsServiceException) {
      return new Error(
        `CloudWatch Logs ${operation} failed: [${error.name}] ${error.message}${idSuffix}${profileSuffix}`,
        { cause: error },
      );
    }

    return new Error(
      `CloudWatch Logs ${operation} failed: ${error instanceof Error ? error.message : String(error)}${idSuffix}${profileSuffix}`,
      { cause: error },
    );
  }
}

function isRecoverableProfileSearchError(error: unknown): boolean {
  if (error === undefined || error === null) return false;
  if (typeof error !== 'object') return false;

  const candidate = error as { readonly name?: unknown; readonly message?: unknown; readonly cause?: unknown };
  if (typeof candidate.name === 'string' && RECOVERABLE_PROFILE_ERROR_NAMES.has(candidate.name)) {
    return true;
  }

  if (typeof candidate.message === 'string') {
    const message = candidate.message.toLowerCase();
    if (message.includes('resourcenotfoundexception') || message.includes('accessdeniedexception')) {
      return true;
    }
  }

  return isRecoverableProfileSearchError(candidate.cause);
}

function buildProfileResolutionError(logGroup: string, attempts: ReadonlyArray<ProfileAttemptError>): Error {
  const details = attempts.map((attempt) => `- ${attempt.profile}: ${attempt.error.message}`).join('\n');
  return new Error(
    `CloudWatch Logs log group "${logGroup}" could not be queried with any configured profile:\n${details}`,
  );
}

function sortRowsByTimestamp(
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
): ReadonlyArray<ReadonlyArray<ResultField>> {
  return rows
    .map((row, index) => ({ row, index, timestamp: getRowTimestamp(row) }))
    .sort((a, b) => {
      if (a.timestamp !== undefined && b.timestamp !== undefined && a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

function getRowTimestamp(row: ReadonlyArray<ResultField>): number | undefined {
  const field = row.find((item) => item.field === '@timestamp');
  const raw = field?.value;
  if (raw === undefined) return undefined;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
