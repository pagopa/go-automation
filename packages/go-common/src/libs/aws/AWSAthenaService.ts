import type {
  AthenaClient,
  ColumnInfo,
  QueryExecution,
  Row,
  StartQueryExecutionCommandOutput,
} from '@aws-sdk/client-athena';
import {
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
} from '@aws-sdk/client-athena';

import { AWSS3Uri } from './AWSS3Uri.js';
import { GOBackoff, GOPoller, GOPollingPolicies } from '../core/polling/index.js';
import type { GOPollAttemptHandler, GOSleeper } from '../core/polling/index.js';
import { AWSActiveOperationRegistry } from './AWSActiveOperationRegistry.js';
import type { AWSRemoteCleanupWarningHandler } from './AWSActiveOperationRegistry.js';

/**
 * Service for executing Athena queries.
 *
 * @example
 * ```typescript
 * const service = new AWSAthenaService(script.aws.clients.athena);
 * const results = await service.query('my_database', 'SELECT * FROM table LIMIT 10', {
 *   outputLocation: 's3://my-bucket/athena-results/',
 * });
 * ```
 */
export interface AWSAthenaQueryOptions {
  /** Optional Athena data catalog. */
  readonly catalog?: string;
  /** Optional Athena workgroup. */
  readonly workGroup?: string;
  /** Optional values for positional `?` placeholders. */
  readonly parameters?: ReadonlyArray<string>;
  /**
   * Optional S3 location for Athena query results.
   *
   * Can be omitted when the Athena workgroup enforces its own result
   * configuration.
   */
  readonly outputLocation?: string;
  /** Optional max poll attempts override. */
  readonly maxPollAttempts?: number;
  /** Optional constant poll interval override in milliseconds. */
  readonly pollIntervalMs?: number;
  /** Optional poll progress hook. */
  readonly onPollAttempt?: AWSAthenaPollAttemptHandler;
  /** Optional sleeper override, useful for tests. */
  readonly sleeper?: GOSleeper;
  /** Optional abort signal to cancel the query. */
  readonly signal?: AbortSignal;
  /** Receives bounded cleanup warnings without changing cancellation semantics. */
  readonly onCleanupWarning?: AWSRemoteCleanupWarningHandler;
}

export type AWSAthenaPollAttemptHandler = GOPollAttemptHandler;

export interface AWSAthenaQueryColumn {
  readonly name: string;
  readonly type?: string;
}

export interface AWSAthenaQueryResult {
  readonly executionId: string;
  readonly database: string;
  readonly catalog?: string;
  readonly workGroup?: string;
  readonly outputLocation?: string;
  readonly columns: ReadonlyArray<AWSAthenaQueryColumn>;
  readonly rows: ReadonlyArray<Record<string, string>>;
  readonly rowCount: number;
  readonly submittedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

export class AWSAthenaService {
  constructor(
    private readonly client: AthenaClient,
    private readonly activeOperations: AWSActiveOperationRegistry | undefined = undefined,
  ) {}

  /** Returns a service bound to the active-operation registry of one execution. */
  forExecution(activeOperations: AWSActiveOperationRegistry): AWSAthenaService {
    return new AWSAthenaService(this.client, activeOperations);
  }

  /**
   * Executes an Athena query and waits for results.
   *
   * When `parameters` are provided, they are passed as `ExecutionParameters`
   * to Athena, replacing `?` positional placeholders in the query string.
   *
   * @param database - Athena database name
   * @param query - SQL query string, optionally with positional `?` placeholders
   * @param options - Optional query parameters, result location, and abort signal
   * @returns Parsed result rows as key-value records
   */
  async query(
    database: string,
    query: string,
    options: AWSAthenaQueryOptions = {},
  ): Promise<ReadonlyArray<Record<string, string>>> {
    return (await this.executeQuery(database, query, options)).rows;
  }

  async executeQuery(
    database: string,
    query: string,
    options: AWSAthenaQueryOptions = {},
  ): Promise<AWSAthenaQueryResult> {
    const outputLocation = normalizeOutputLocation(options.outputLocation);
    const catalog = normalizeOptionalString(options.catalog);
    const workGroup = normalizeOptionalString(options.workGroup);
    const startedAt = Date.now();
    let startResponse: StartQueryExecutionCommandOutput;
    try {
      startResponse = await this.client.send(
        new StartQueryExecutionCommand({
          QueryString: query,
          QueryExecutionContext: {
            Database: database,
            ...(catalog !== undefined ? { Catalog: catalog } : {}),
          },
          ...(workGroup !== undefined ? { WorkGroup: workGroup } : {}),
          ...(outputLocation !== undefined ? { ResultConfiguration: { OutputLocation: outputLocation } } : {}),
          ...(options.parameters !== undefined && options.parameters.length > 0
            ? { ExecutionParameters: [...options.parameters] }
            : {}),
        }),
        ...(options.signal !== undefined ? [{ abortSignal: options.signal }] : []),
      );
    } catch (error: unknown) {
      if (options.signal?.aborted === true) {
        options.onCleanupWarning?.({
          service: 'ATHENA',
          operationId: 'unknown',
          code: 'REMOTE_QUERY_STOP_FAILED',
          message:
            'REMOTE_OPERATION_ID_UNKNOWN: StartQueryExecution may have been accepted before the response was lost',
        });
      }
      throw error;
    }

    const executionId = startResponse.QueryExecutionId;
    if (executionId === undefined) {
      throw new Error('Athena query did not return a QueryExecutionId');
    }

    const registry = this.activeOperations ?? new AWSActiveOperationRegistry();
    const registered = registry.register({
      service: 'ATHENA',
      operationId: executionId,
      stop: async (cleanupSignal): Promise<void> => {
        await this.client.send(new StopQueryExecutionCommand({ QueryExecutionId: executionId }), {
          abortSignal: cleanupSignal,
        });
      },
    });

    const poller = new GOPoller({
      ...GOPollingPolicies.athenaQuery(),
      ...(options.maxPollAttempts !== undefined ? { maxAttempts: options.maxPollAttempts } : {}),
      ...(options.pollIntervalMs !== undefined ? { backoff: GOBackoff.constant(options.pollIntervalMs) } : {}),
      ...(options.sleeper !== undefined ? { sleeper: options.sleeper } : {}),
      ...(options.onPollAttempt !== undefined ? { onAttempt: options.onPollAttempt } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });

    let execution: QueryExecution;
    let resultSet: { readonly rows: ReadonlyArray<Row>; readonly columnInfo: ReadonlyArray<ColumnInfo> };
    try {
      execution = await poller.poll<QueryExecution>(async () => {
        const statusResponse = await this.client.send(
          new GetQueryExecutionCommand({ QueryExecutionId: executionId }),
          ...(options.signal !== undefined ? [{ abortSignal: options.signal }] : []),
        );
        const state = statusResponse.QueryExecution?.Status?.State;

        if (state === 'SUCCEEDED') {
          const queryExecution = statusResponse.QueryExecution;
          if (queryExecution === undefined) {
            return {
              type: 'failure',
              error: new Error('Athena query succeeded but no execution metadata was returned'),
            };
          }
          return { type: 'success', value: queryExecution };
        }
        if (state === 'FAILED' || state === 'CANCELLED') {
          const reason = statusResponse.QueryExecution?.Status?.StateChangeReason ?? 'Unknown';
          return { type: 'failure', error: new Error(`Athena query ${state}: ${reason}`), reason };
        }
        return { type: 'continue', ...(state !== undefined ? { reason: state } : {}) };
      });

      resultSet = await this.fetchAllResults(executionId, options.signal);
    } catch (error: unknown) {
      if (options.signal?.aborted === true) {
        const warning = await registered.stop();
        if (warning !== undefined) options.onCleanupWarning?.(warning);
      }
      throw error;
    } finally {
      registered.unregister();
    }
    const completedAt = Date.now();
    const submittedAt = execution.Status?.SubmissionDateTime ?? new Date(startedAt);
    const completedDate = execution.Status?.CompletionDateTime ?? new Date(completedAt);
    const parsedRows = this.parseResultRows(resultSet.rows, resultSet.columnInfo);

    return {
      executionId,
      database,
      ...(catalog !== undefined ? { catalog } : {}),
      ...(workGroup !== undefined ? { workGroup } : {}),
      ...(outputLocation !== undefined ? { outputLocation } : {}),
      columns: parsedRows.columns,
      rows: parsedRows.rows,
      rowCount: parsedRows.rows.length,
      submittedAt: submittedAt.toISOString(),
      completedAt: completedDate.toISOString(),
      durationMs: Math.max(0, completedDate.getTime() - submittedAt.getTime()),
    };
  }

  private async fetchAllResults(
    executionId: string,
    signal: AbortSignal | undefined,
  ): Promise<{
    readonly rows: ReadonlyArray<Row>;
    readonly columnInfo: ReadonlyArray<ColumnInfo>;
  }> {
    const allRows: Row[] = [];
    let columnInfo: ReadonlyArray<ColumnInfo> = [];
    let nextToken: string | undefined;

    do {
      const resultsResponse = await this.client.send(
        new GetQueryResultsCommand({
          QueryExecutionId: executionId,
          ...(nextToken !== undefined ? { NextToken: nextToken } : {}),
        }),
        ...(signal !== undefined ? [{ abortSignal: signal }] : []),
      );

      if (columnInfo.length === 0) {
        columnInfo = resultsResponse.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      }
      allRows.push(...(resultsResponse.ResultSet?.Rows ?? []));
      nextToken = resultsResponse.NextToken;
    } while (nextToken !== undefined);

    return {
      rows: allRows,
      columnInfo,
    };
  }

  /**
   * Parses Athena result rows into key-value records.
   * The first row is treated as the header row.
   */
  private parseResultRows(
    rows: ReadonlyArray<Row>,
    columnInfo: ReadonlyArray<ColumnInfo>,
  ): {
    readonly columns: ReadonlyArray<AWSAthenaQueryColumn>;
    readonly rows: ReadonlyArray<Record<string, string>>;
  } {
    if (rows.length === 0) {
      return {
        columns: columnInfoToColumns(columnInfo),
        rows: [],
      };
    }

    const headerRow = rows[0];
    const headers =
      columnInfo.length > 0
        ? columnInfo.map((column) => column.Name ?? '')
        : (headerRow?.Data?.map((d) => d.VarCharValue ?? '') ?? []);
    const columns =
      columnInfo.length > 0
        ? columnInfoToColumns(columnInfo)
        : headers.filter((header) => header.length > 0).map((name) => ({ name }));

    const results: Record<string, string>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row?.Data === undefined) {
        continue;
      }

      const record: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (header === undefined || header.length === 0) {
          continue;
        }

        const value = row.Data[j]?.VarCharValue ?? '';
        record[header] = value;
      }
      results.push(record);
    }

    return {
      columns,
      rows: results,
    };
  }
}

function normalizeOutputLocation(outputLocation: string | undefined): string | undefined {
  const trimmed = outputLocation?.trim();
  if (trimmed === undefined || trimmed === '') {
    return undefined;
  }

  try {
    AWSS3Uri.parse(trimmed);
  } catch {
    throw invalidOutputLocationError();
  }

  return trimmed;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function columnInfoToColumns(columnInfo: ReadonlyArray<ColumnInfo>): ReadonlyArray<AWSAthenaQueryColumn> {
  return columnInfo
    .filter((column) => column.Name !== undefined && column.Name.length > 0)
    .map((column) => ({
      name: column.Name ?? '',
      ...(column.Type !== undefined ? { type: column.Type } : {}),
    }));
}

function invalidOutputLocationError(): Error {
  return new Error('Invalid Athena output location. Expected an S3 URI like s3://bucket/prefix/.');
}
