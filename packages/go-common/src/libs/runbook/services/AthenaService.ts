import type { AthenaClient } from '@aws-sdk/client-athena';
import { StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from '@aws-sdk/client-athena';

/** Polling interval for Athena query results */
const QUERY_POLL_INTERVAL_MS = 2000;

/** Maximum polling attempts before timing out */
const MAX_POLL_ATTEMPTS = 120;

/**
 * Service for executing Athena queries.
 *
 * @example
 * ```typescript
 * const service = new AthenaService(client, 's3://my-bucket/athena-results/');
 * const results = await service.query('my-database', 'SELECT * FROM table LIMIT 10');
 * ```
 */
export class AthenaService {
  constructor(
    private readonly client: AthenaClient,
    private readonly outputLocation: string,
  ) {}

  /**
   * Executes an Athena query and waits for results.
   *
   * @param database - Athena database name
   * @param query - SQL query string
   * @returns Array of result rows as key-value records
   */
  async query(database: string, query: string): Promise<ReadonlyArray<Record<string, string>>> {
    const startResponse = await this.client.send(
      new StartQueryExecutionCommand({
        QueryString: query,
        QueryExecutionContext: { Database: database },
        ResultConfiguration: { OutputLocation: this.outputLocation },
      }),
    );

    const executionId = startResponse.QueryExecutionId;
    if (executionId === undefined) {
      throw new Error('Athena query did not return a QueryExecutionId');
    }

    // Poll for completion
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const statusResponse = await this.client.send(new GetQueryExecutionCommand({ QueryExecutionId: executionId }));

      const state = statusResponse.QueryExecution?.Status?.State;
      if (state === 'SUCCEEDED') {
        break;
      }
      if (state === 'FAILED' || state === 'CANCELLED') {
        const reason = statusResponse.QueryExecution?.Status?.StateChangeReason ?? 'Unknown';
        throw new Error(`Athena query ${state}: ${reason}`);
      }

      await this.sleep(QUERY_POLL_INTERVAL_MS);

      if (attempt === MAX_POLL_ATTEMPTS - 1) {
        throw new Error(`Athena query timed out after ${MAX_POLL_ATTEMPTS} attempts: ${executionId}`);
      }
    }

    // Fetch results
    const resultsResponse = await this.client.send(new GetQueryResultsCommand({ QueryExecutionId: executionId }));

    const rows = resultsResponse.ResultSet?.Rows ?? [];
    if (rows.length === 0) {
      return [];
    }

    // First row is the header
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

  /**
   * Sleeps for the specified milliseconds.
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
