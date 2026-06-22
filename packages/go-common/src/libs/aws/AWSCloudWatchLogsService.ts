import type {
  CloudWatchLogsClient,
  GetQueryResultsCommandOutput,
  ResultField,
  StartQueryCommandOutput,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  CloudWatchLogsServiceException,
  GetQueryResultsCommand,
  StartQueryCommand,
  StopQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { GOPoller, GOPollingPolicies } from '../core/polling/index.js';

import type { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
import { AWSActiveOperationRegistry } from './AWSActiveOperationRegistry.js';
import type { AWSRemoteCleanupWarningHandler } from './AWSActiveOperationRegistry.js';

/** Non-success terminal statuses for CloudWatch Logs Insights queries (Complete handled separately). */
const FAILURE_STATUSES: ReadonlySet<string> = new Set(['Failed', 'Cancelled', 'Timeout']);
const DEFAULT_QUERY_RESULTS_PAGE_SIZE = 10_000;
const DEFAULT_QUERY_RESULTS_MAX_PAGES = 10;

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
   * When true, fetch every available GetQueryResults page for a completed
   * CloudWatch Logs Insights query. Disabled by default to preserve the
   * previous single-page behaviour for existing scripts.
   */
  readonly paginateResults?: boolean;
  /** Page size for paginated GetQueryResults calls. Default and max: 10,000. */
  readonly queryResultsPageSize?: number;
  /** Safety cap for paginated GetQueryResults calls. Default: 10 pages (100,000 rows max). */
  readonly maxResultPages?: number;
  /**
   * Log group resolution strategy.
   *
   * - `default-profile-only`: query only the first configured profile.
   * - `search-configured-profiles`: try configured profiles in order until
   *   the log group can be queried, caching successful resolutions.
   */
  readonly logGroupResolutionMode?: AWSCloudWatchLogsLogGroupResolutionMode;
  /** Receives bounded cleanup warnings without changing the runbook outcome. */
  readonly onCleanupWarning?: AWSRemoteCleanupWarningHandler;
}

/** Source account and region fixed for one OAM-backed execution. */
export interface AWSCloudWatchLogsTarget {
  readonly accountId?: string;
  readonly region: string;
}

export type AWSCloudWatchLogsConfigurationErrorCode =
  | 'OAM_ACCESS_DENIED'
  | 'LOG_GROUP_NOT_FOUND'
  | 'OAM_REGION_MISMATCH'
  | 'INVALID_OAM_TARGET';

export interface AWSCloudWatchLogsConfigurationError extends Error {
  readonly code: AWSCloudWatchLogsConfigurationErrorCode;
}

export function isAWSCloudWatchLogsConfigurationError(error: unknown): error is AWSCloudWatchLogsConfigurationError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    CONFIGURATION_ERROR_CODES.has(error.code)
  );
}

export interface AWSCloudWatchLogsQueryStatistics {
  readonly bytesScanned: number;
  readonly recordsScanned: number;
  readonly recordsMatched: number;
  readonly logGroupsScanned?: number;
  readonly estimatedBytesSkipped?: number;
  readonly estimatedRecordsSkipped?: number;
}

export interface AWSCloudWatchLogsQueryExecution {
  readonly queryId: string;
  readonly profile: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
}

export interface AWSCloudWatchLogsQueryResult {
  readonly rows: ReadonlyArray<ReadonlyArray<ResultField>>;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  readonly queryExecutions: ReadonlyArray<AWSCloudWatchLogsQueryExecution>;
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

  constructor(
    private readonly clientProvider: AWSMultiClientProvider,
    private readonly target: AWSCloudWatchLogsTarget | undefined = undefined,
    private readonly activeOperations: AWSActiveOperationRegistry | undefined = undefined,
  ) {
    if (target !== undefined) validateTarget(target);
  }

  /** Returns an execution-scoped OAM service without mutating the shared provider. */
  forTarget(
    target: AWSCloudWatchLogsTarget,
    activeOperations: AWSActiveOperationRegistry = new AWSActiveOperationRegistry(),
  ): AWSCloudWatchLogsService {
    return new AWSCloudWatchLogsService(this.clientProvider, target, activeOperations);
  }

  async query(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options: AWSCloudWatchLogsQueryOptions = {},
  ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
    const result = await this.queryWithStatistics(logGroups, query, timeRange, options);
    return result.rows;
  }

  async queryWithStatistics(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options: AWSCloudWatchLogsQueryOptions = {},
  ): Promise<AWSCloudWatchLogsQueryResult> {
    this.validateInput(logGroups, query, timeRange);

    if (this.target !== undefined) {
      return this.queryWithTarget(logGroups, query, timeRange, options);
    }

    const mode = options.logGroupResolutionMode ?? 'default-profile-only';
    if (mode === 'default-profile-only') {
      return this.queryWithProfile(this.clientProvider.first.getProfile(), logGroups, query, timeRange, options);
    }

    const results: AWSCloudWatchLogsQueryResult[] = [];
    for (const logGroup of logGroups) {
      results.push(await this.queryLogGroupAcrossProfiles(logGroup, query, timeRange, options));
    }

    return {
      rows: sortRowsByTimestamp(results.flatMap((result) => result.rows)),
      statistics: sumCloudWatchLogsQueryStatistics(results.map((result) => result.statistics)),
      queryExecutions: results.flatMap((result) => result.queryExecutions),
    };
  }

  clearLogGroupResolutionCache(): void {
    this.logGroupProfileCache.clear();
  }

  private async queryWithTarget(
    logGroups: ReadonlyArray<string>,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options: AWSCloudWatchLogsQueryOptions,
  ): Promise<AWSCloudWatchLogsQueryResult> {
    const target = this.target;
    if (target === undefined) {
      throw new Error('CloudWatch Logs target is not configured');
    }
    const providerRegion = this.clientProvider.first.getRegion();
    if (providerRegion !== target.region) {
      throw configurationError(
        'OAM_REGION_MISMATCH',
        `CloudWatch Logs provider region ${providerRegion} does not match execution target ${target.region}`,
      );
    }
    const identifiers = logGroups.map((logGroup) => toLogGroupIdentifier(logGroup, target));
    return await this.queryWithProfile(
      this.clientProvider.first.getProfile(),
      identifiers,
      query,
      timeRange,
      options,
      true,
    );
  }

  private async queryLogGroupAcrossProfiles(
    logGroup: string,
    query: string,
    timeRange: AWSCloudWatchLogsTimeRange,
    options: AWSCloudWatchLogsQueryOptions,
  ): Promise<AWSCloudWatchLogsQueryResult> {
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
    useIdentifiers: boolean = false,
  ): Promise<AWSCloudWatchLogsQueryResult> {
    const client = this.clientProvider.getClientProvider(profile).cloudWatchLogs;
    let queryId: string;
    try {
      queryId = await this.startQuery(client, profile, logGroups, query, timeRange, options.signal, useIdentifiers);
    } catch (error: unknown) {
      if (options.signal?.aborted === true) {
        options.onCleanupWarning?.({
          service: 'LOGS',
          operationId: 'unknown',
          code: 'REMOTE_QUERY_STOP_FAILED',
          message: 'REMOTE_OPERATION_ID_UNKNOWN: StartQuery may have been accepted before the response was lost',
        });
      }
      throw error;
    }
    const registry = this.activeOperations ?? new AWSActiveOperationRegistry();
    const registered = registry.register({
      service: 'LOGS',
      operationId: queryId,
      stop: async (cleanupSignal): Promise<void> => {
        await client.send(new StopQueryCommand({ queryId }), { abortSignal: cleanupSignal });
      },
    });

    const poller = new GOPoller({
      ...GOPollingPolicies.cloudWatchLogsQuery(),
      ...(options.maxPollAttempts !== undefined ? { maxAttempts: options.maxPollAttempts } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });

    try {
      return await poller.poll<AWSCloudWatchLogsQueryResult>(async () => {
        let response: GetQueryResultsCommandOutput;
        try {
          response = await client.send(
            new GetQueryResultsCommand({
              queryId,
              ...(options.paginateResults === true ? { maxItems: resolveQueryResultsPageSize(options) } : {}),
            }),
            ...(options.signal !== undefined ? [{ abortSignal: options.signal }] : []),
          );
        } catch (error: unknown) {
          throw this.wrapAwsError('GetQueryResults', profile, queryId, error);
        }

        const status = response.status;
        if (status === 'Complete') {
          const queryResult =
            options.paginateResults === true
              ? await this.collectCompleteQueryResults(client, profile, queryId, logGroups, response, options)
              : this.buildSinglePageQueryResult(queryId, profile, logGroups, response);
          return {
            type: 'success',
            value: queryResult,
          };
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
    } catch (error: unknown) {
      if (options.signal?.aborted === true) {
        const warning = await registered.stop();
        if (warning !== undefined) options.onCleanupWarning?.(warning);
      }
      throw error;
    } finally {
      registered.unregister();
    }
  }

  private buildSinglePageQueryResult(
    queryId: string,
    profile: string,
    logGroups: ReadonlyArray<string>,
    response: GetQueryResultsCommandOutput,
  ): AWSCloudWatchLogsQueryResult {
    const statistics = normalizeQueryStatistics(response.statistics);
    return {
      rows: response.results ?? [],
      statistics,
      queryExecutions: [
        {
          queryId,
          profile,
          logGroups: [...logGroups],
          statistics,
        },
      ],
    };
  }

  private async collectCompleteQueryResults(
    client: CloudWatchLogsClient,
    profile: string,
    queryId: string,
    logGroups: ReadonlyArray<string>,
    firstPage: GetQueryResultsCommandOutput,
    options: AWSCloudWatchLogsQueryOptions,
  ): Promise<AWSCloudWatchLogsQueryResult> {
    const rows: ResultField[][] = [...(firstPage.results ?? [])];
    const pageSize = resolveQueryResultsPageSize(options);
    const maxPages = resolveMaxResultPages(options);
    let statistics = normalizeQueryStatistics(firstPage.statistics);
    let nextToken = firstPage.nextToken;
    let pageCount = 1;
    const seenTokens = new Set<string>();

    while (nextToken !== undefined) {
      if (seenTokens.has(nextToken)) {
        throw new Error(`CloudWatch Logs GetQueryResults returned a repeated nextToken for queryId ${queryId}`);
      }
      seenTokens.add(nextToken);

      if (pageCount >= maxPages) {
        throw new Error(`CloudWatch Logs GetQueryResults exceeded ${maxPages} pages for queryId ${queryId}`);
      }

      let page: GetQueryResultsCommandOutput;
      try {
        page = await client.send(
          new GetQueryResultsCommand({ queryId, nextToken, maxItems: pageSize }),
          ...(options.signal !== undefined ? [{ abortSignal: options.signal }] : []),
        );
      } catch (error: unknown) {
        throw this.wrapAwsError('GetQueryResults', profile, queryId, error);
      }

      if (page.status !== 'Complete') {
        const status = page.status ?? 'Unknown';
        throw new Error(
          `CloudWatch Logs GetQueryResults returned status ${status} while paginating queryId ${queryId}`,
        );
      }

      rows.push(...(page.results ?? []));
      statistics = normalizeQueryStatistics(page.statistics ?? firstPage.statistics);
      nextToken = page.nextToken;
      pageCount += 1;
    }

    return {
      rows,
      statistics,
      queryExecutions: [
        {
          queryId,
          profile,
          logGroups: [...logGroups],
          statistics,
        },
      ],
    };
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
    useIdentifiers: boolean = false,
  ): Promise<string> {
    if (signal?.aborted === true) {
      throw new Error('CloudWatch Logs query aborted before start');
    }

    let startQueryResponse: StartQueryCommandOutput;
    try {
      startQueryResponse = await client.send(
        new StartQueryCommand({
          ...(useIdentifiers ? { logGroupIdentifiers: [...logGroups] } : { logGroupNames: [...logGroups] }),
          queryString: query,
          startTime: Math.floor(timeRange.start.getTime() / 1000),
          endTime: Math.floor(timeRange.end.getTime() / 1000),
        }),
        ...(signal !== undefined ? [{ abortSignal: signal }] : []),
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
      if (error.name === 'AccessDeniedException') {
        return configurationError(
          'OAM_ACCESS_DENIED',
          `CloudWatch Logs ${operation} access denied${idSuffix}${profileSuffix}`,
          error,
        );
      }
      if (error.name === 'ResourceNotFoundException') {
        return configurationError(
          'LOG_GROUP_NOT_FOUND',
          `CloudWatch Logs ${operation} log group not found${idSuffix}${profileSuffix}`,
          error,
        );
      }
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

interface QueryStatisticsLike {
  readonly bytesScanned?: number | undefined;
  readonly recordsScanned?: number | undefined;
  readonly recordsMatched?: number | undefined;
  readonly logGroupsScanned?: number | undefined;
  readonly estimatedBytesSkipped?: number | undefined;
  readonly estimatedRecordsSkipped?: number | undefined;
}

function normalizeQueryStatistics(statistics: QueryStatisticsLike | undefined): AWSCloudWatchLogsQueryStatistics {
  const result: AWSCloudWatchLogsQueryStatistics = {
    bytesScanned: finiteOrZero(statistics?.bytesScanned),
    recordsScanned: finiteOrZero(statistics?.recordsScanned),
    recordsMatched: finiteOrZero(statistics?.recordsMatched),
    ...optionalFinite('logGroupsScanned', statistics?.logGroupsScanned),
    ...optionalFinite('estimatedBytesSkipped', statistics?.estimatedBytesSkipped),
    ...optionalFinite('estimatedRecordsSkipped', statistics?.estimatedRecordsSkipped),
  };
  return result;
}

export function sumCloudWatchLogsQueryStatistics(
  statistics: ReadonlyArray<AWSCloudWatchLogsQueryStatistics>,
): AWSCloudWatchLogsQueryStatistics {
  let bytesScanned = 0;
  let recordsScanned = 0;
  let recordsMatched = 0;
  let logGroupsScanned = 0;
  let estimatedBytesSkipped = 0;
  let estimatedRecordsSkipped = 0;
  let hasLogGroupsScanned = false;
  let hasEstimatedBytesSkipped = false;
  let hasEstimatedRecordsSkipped = false;

  for (const item of statistics) {
    bytesScanned += item.bytesScanned;
    recordsScanned += item.recordsScanned;
    recordsMatched += item.recordsMatched;
    if (item.logGroupsScanned !== undefined) {
      hasLogGroupsScanned = true;
      logGroupsScanned += item.logGroupsScanned;
    }
    if (item.estimatedBytesSkipped !== undefined) {
      hasEstimatedBytesSkipped = true;
      estimatedBytesSkipped += item.estimatedBytesSkipped;
    }
    if (item.estimatedRecordsSkipped !== undefined) {
      hasEstimatedRecordsSkipped = true;
      estimatedRecordsSkipped += item.estimatedRecordsSkipped;
    }
  }

  return {
    bytesScanned,
    recordsScanned,
    recordsMatched,
    ...(hasLogGroupsScanned ? { logGroupsScanned } : {}),
    ...(hasEstimatedBytesSkipped ? { estimatedBytesSkipped } : {}),
    ...(hasEstimatedRecordsSkipped ? { estimatedRecordsSkipped } : {}),
  };
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function optionalFinite<TKey extends keyof AWSCloudWatchLogsQueryStatistics>(
  key: TKey,
  value: number | undefined,
): Partial<Pick<AWSCloudWatchLogsQueryStatistics, TKey>> {
  return typeof value === 'number' && Number.isFinite(value)
    ? ({ [key]: value } as Pick<AWSCloudWatchLogsQueryStatistics, TKey>)
    : {};
}

function resolveQueryResultsPageSize(options: AWSCloudWatchLogsQueryOptions): number {
  const requested = options.queryResultsPageSize ?? DEFAULT_QUERY_RESULTS_PAGE_SIZE;
  if (!Number.isInteger(requested) || requested < 1 || requested > DEFAULT_QUERY_RESULTS_PAGE_SIZE) {
    throw new Error(
      `CloudWatch Logs queryResultsPageSize must be an integer between 1 and ${DEFAULT_QUERY_RESULTS_PAGE_SIZE}`,
    );
  }
  return requested;
}

function resolveMaxResultPages(options: AWSCloudWatchLogsQueryOptions): number {
  const requested = options.maxResultPages ?? DEFAULT_QUERY_RESULTS_MAX_PAGES;
  if (!Number.isInteger(requested) || requested < 1 || requested > DEFAULT_QUERY_RESULTS_MAX_PAGES) {
    throw new Error(
      `CloudWatch Logs maxResultPages must be an integer between 1 and ${DEFAULT_QUERY_RESULTS_MAX_PAGES}`,
    );
  }
  return requested;
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

const CONFIGURATION_ERROR_CODES: ReadonlySet<string> = new Set([
  'OAM_ACCESS_DENIED',
  'LOG_GROUP_NOT_FOUND',
  'OAM_REGION_MISMATCH',
  'INVALID_OAM_TARGET',
]);

function validateTarget(target: AWSCloudWatchLogsTarget): void {
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(target.region)) {
    throw configurationError('INVALID_OAM_TARGET', `Invalid AWS region: ${target.region}`);
  }
  if (target.accountId !== undefined && !/^\d{12}$/.test(target.accountId)) {
    throw configurationError('INVALID_OAM_TARGET', `Invalid AWS account id: ${target.accountId}`);
  }
}

function toLogGroupIdentifier(logGroup: string, target: AWSCloudWatchLogsTarget): string {
  const trimmed = logGroup.trim();
  if (trimmed === '') {
    throw configurationError('INVALID_OAM_TARGET', 'CloudWatch Logs log group cannot be empty');
  }
  if (trimmed.startsWith('arn:')) {
    const arnMatch = /^arn:aws:logs:([^:]+):(\d{12}):log-group:(.+)$/.exec(trimmed);
    if (arnMatch?.[1] !== target.region || arnMatch[2] !== target.accountId) {
      throw configurationError('INVALID_OAM_TARGET', `Log group ARN is outside the execution target: ${trimmed}`);
    }
    return trimmed;
  }
  if (target.accountId === undefined) {
    return trimmed;
  }
  return `arn:aws:logs:${target.region}:${target.accountId}:log-group:${trimmed}`;
}

function configurationError(
  code: AWSCloudWatchLogsConfigurationErrorCode,
  message: string,
  cause?: unknown,
): AWSCloudWatchLogsConfigurationError {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause });
  return Object.assign(error, { code });
}
