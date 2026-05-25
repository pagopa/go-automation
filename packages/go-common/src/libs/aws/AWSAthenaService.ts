import type { AthenaClient, Row } from '@aws-sdk/client-athena';
import { GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand } from '@aws-sdk/client-athena';

import { GOBackoff, GOPoller } from '../core/polling/index.js';

/** Default polling interval for Athena query results. */
const ATHENA_POLL_INTERVAL_MS = 2000;

/** Default maximum polling attempts for Athena queries. */
const ATHENA_MAX_POLL_ATTEMPTS = 120;

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
  /** Optional values for positional `?` placeholders. */
  readonly parameters?: ReadonlyArray<string>;
  /**
   * Optional S3 location for Athena query results.
   *
   * Can be omitted when the Athena workgroup enforces its own result
   * configuration.
   */
  readonly outputLocation?: string;
  /** Optional abort signal to cancel the query. */
  readonly signal?: AbortSignal;
}

export class AWSAthenaService {
  constructor(private readonly client: AthenaClient) {}

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
    const outputLocation = normalizeOutputLocation(options.outputLocation);
    const startResponse = await this.client.send(
      new StartQueryExecutionCommand({
        QueryString: query,
        QueryExecutionContext: { Database: database },
        ...(outputLocation !== undefined ? { ResultConfiguration: { OutputLocation: outputLocation } } : {}),
        ...(options.parameters !== undefined && options.parameters.length > 0
          ? { ExecutionParameters: [...options.parameters] }
          : {}),
      }),
      ...(options.signal !== undefined ? [{ abortSignal: options.signal }] : []),
    );

    const executionId = startResponse.QueryExecutionId;
    if (executionId === undefined) {
      throw new Error('Athena query did not return a QueryExecutionId');
    }

    const poller = new GOPoller({
      maxAttempts: ATHENA_MAX_POLL_ATTEMPTS,
      backoff: GOBackoff.constant(ATHENA_POLL_INTERVAL_MS),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });

    await poller.poll<true>(async () => {
      const statusResponse = await this.client.send(new GetQueryExecutionCommand({ QueryExecutionId: executionId }));
      const state = statusResponse.QueryExecution?.Status?.State;

      if (state === 'SUCCEEDED') {
        return { type: 'success', value: true };
      }
      if (state === 'FAILED' || state === 'CANCELLED') {
        const reason = statusResponse.QueryExecution?.Status?.StateChangeReason ?? 'Unknown';
        return { type: 'failure', error: new Error(`Athena query ${state}: ${reason}`), reason };
      }
      // QUEUED | RUNNING | undefined → non-terminal, keep polling.
      return { type: 'continue', ...(state !== undefined ? { reason: state } : {}) };
    });

    const allRows: Row[] = [];
    let nextToken: string | undefined;

    do {
      const resultsResponse = await this.client.send(
        new GetQueryResultsCommand({
          QueryExecutionId: executionId,
          ...(nextToken !== undefined ? { NextToken: nextToken } : {}),
        }),
      );

      allRows.push(...(resultsResponse.ResultSet?.Rows ?? []));
      nextToken = resultsResponse.NextToken;
    } while (nextToken !== undefined);

    return this.parseResultRows(allRows);
  }

  /**
   * Parses Athena result rows into key-value records.
   * The first row is treated as the header row.
   */
  private parseResultRows(rows: ReadonlyArray<Row>): ReadonlyArray<Record<string, string>> {
    if (rows.length === 0) {
      return [];
    }

    const headerRow = rows[0];
    const headers = headerRow?.Data?.map((d) => d.VarCharValue ?? '') ?? [];

    const results: Record<string, string>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row?.Data === undefined) {
        continue;
      }

      const record: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        const value = row.Data[j]?.VarCharValue ?? '';
        if (header !== undefined) {
          record[header] = value;
        }
      }
      results.push(record);
    }

    return results;
  }
}

function normalizeOutputLocation(outputLocation: string | undefined): string | undefined {
  const trimmed = outputLocation?.trim();
  if (trimmed === undefined || trimmed === '') {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw invalidOutputLocationError();
  }

  if (
    parsed.protocol !== 's3:' ||
    parsed.hostname === '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    /\s/.test(trimmed)
  ) {
    throw invalidOutputLocationError();
  }

  return trimmed;
}

function invalidOutputLocationError(): Error {
  return new Error('Invalid Athena output location. Expected an S3 URI like s3://bucket/prefix/.');
}
