import type { AthenaClient, Row } from '@aws-sdk/client-athena';
import { GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand } from '@aws-sdk/client-athena';

import { fixedBackoff, pollUntilComplete } from '../core/utils/index.js';

/** Default polling interval for Athena query results. */
const ATHENA_POLL_INTERVAL_MS = 2000;

/** Default maximum polling attempts for Athena queries. */
const ATHENA_MAX_POLL_ATTEMPTS = 120;

/** Terminal states for Athena query execution. */
const ATHENA_TERMINAL_STATES: ReadonlySet<string> = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/**
 * Service for executing Athena queries.
 *
 * @example
 * ```typescript
 * const service = new AWSAthenaService(script.aws.clients.athena, 's3://my-bucket/athena-results/');
 * const results = await service.query('my_database', 'SELECT * FROM table LIMIT 10');
 * ```
 */
export class AWSAthenaService {
  constructor(
    private readonly client: AthenaClient,
    private readonly outputLocation: string,
  ) {}

  /**
   * Executes an Athena query and waits for results.
   *
   * When `parameters` are provided, they are passed as `ExecutionParameters`
   * to Athena, replacing `?` positional placeholders in the query string.
   *
   * @param database - Athena database name
   * @param query - SQL query string, optionally with positional `?` placeholders
   * @param parameters - Optional values for positional `?` placeholders
   * @param signal - Optional abort signal to cancel the query
   * @returns Parsed result rows as key-value records
   */
  async query(
    database: string,
    query: string,
    parameters?: ReadonlyArray<string>,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<Record<string, string>>> {
    const startResponse = await this.client.send(
      new StartQueryExecutionCommand({
        QueryString: query,
        QueryExecutionContext: { Database: database },
        ResultConfiguration: { OutputLocation: this.outputLocation },
        ...(parameters !== undefined && parameters.length > 0 ? { ExecutionParameters: [...parameters] } : {}),
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );

    const executionId = startResponse.QueryExecutionId;
    if (executionId === undefined) {
      throw new Error('Athena query did not return a QueryExecutionId');
    }

    const pollOptions = {
      maxAttempts: ATHENA_MAX_POLL_ATTEMPTS,
      backoff: fixedBackoff(ATHENA_POLL_INTERVAL_MS),
      ...(signal !== undefined ? { signal } : {}),
    };

    await pollUntilComplete(pollOptions, async () => {
      const statusResponse = await this.client.send(new GetQueryExecutionCommand({ QueryExecutionId: executionId }));
      const state = statusResponse.QueryExecution?.Status?.State;

      if (state !== undefined && ATHENA_TERMINAL_STATES.has(state)) {
        if (state !== 'SUCCEEDED') {
          const reason = statusResponse.QueryExecution?.Status?.StateChangeReason ?? 'Unknown';
          throw new Error(`Athena query ${state}: ${reason}`);
        }
        return true;
      }

      return undefined;
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
