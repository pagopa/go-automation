/**
 * Athena Query Executor
 * Executes Athena queries and handles result pagination
 */

import { StartQueryExecutionCommand } from '@aws-sdk/client-athena';
import { Core } from '@go-automation/go-common';

import type { AthenaQueryConfig } from '../types/AthenaQueryConfig.js';
import type { AthenaQueryExecution } from '../types/AthenaQueryExecution.js';
import type { AthenaQueryResults } from '../types/AthenaQueryResults.js';
import type { QueryParams } from '../types/QueryParams.js';
import type { AwsAthenaService } from './AwsAthenaService.js';

/** Terminal states for Athena query execution */
const ATHENA_TERMINAL_STATES: ReadonlySet<string> = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

type AthenaQueryExecutorLogHandler = (message: string) => void;

/**
 * Executes Athena queries with template parameter substitution
 * and handles result pagination
 */
export class AthenaQueryExecutor {
  private readonly athenaService: AwsAthenaService;
  private readonly onLog: AthenaQueryExecutorLogHandler | undefined;

  /**
   * Creates a new Athena Query Executor
   * @param athenaService - AWS Athena service instance
   * @param onLog - Optional callback for logging messages
   */
  constructor(athenaService: AwsAthenaService, onLog?: AthenaQueryExecutorLogHandler) {
    if (!athenaService) {
      throw new Error('Athena Service is required');
    }
    this.athenaService = athenaService;
    this.onLog = onLog;
  }

  /**
   * Logs a message using the configured callback or console
   * @param message - Message to log
   */
  private log(message: string): void {
    if (this.onLog) {
      this.onLog(message);
    }
  }

  /**
   * Executes an Athena query with template parameter substitution
   * @param queryTemplate - SQL query template with {{param}} placeholders
   * @param config - Athena configuration (database, workgroup, etc.)
   * @param params - Parameters to substitute in the query template
   * @returns Query results after successful execution
   * @throws Error if query fails, is cancelled, or times out
   */
  public async executeQuery(
    queryTemplate: string,
    config: AthenaQueryConfig,
    params: QueryParams = {},
  ): Promise<AthenaQueryResults> {
    const { database, catalog, workGroup, outputLocation, maxRetries = 60, retryDelay = 5000 } = config;

    if (!database) {
      throw new Error('Athena database is required');
    }

    // Substitute parameters in the query
    const query = this.replaceQueryParams(queryTemplate, params);

    this.log(`Executing query on database: ${database}`);
    this.log(`Catalog: ${catalog}, WorkGroup: ${workGroup}`);

    const command = new StartQueryExecutionCommand({
      QueryExecutionContext: {
        Database: database,
        Catalog: catalog,
      },
      QueryString: query,
      WorkGroup: workGroup,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    });

    const athenaClient = this.athenaService.getAthenaClient();
    const startResult = await athenaClient.send(command);
    const queryExecutionId = startResult.QueryExecutionId;

    if (!queryExecutionId) {
      throw new Error('Failed to start query execution: no execution ID returned');
    }

    this.log(`Query started with ID: ${queryExecutionId}`);
    const execution = await this.waitForQueryCompletion(queryExecutionId, maxRetries, retryDelay);

    // Check final state
    const state = execution.QueryExecution.Status.State;
    if (state === 'SUCCEEDED') {
      this.log('Query executed successfully');
      return this.fetchAllResults(queryExecutionId);
    }

    if (state === 'FAILED') {
      const reason = execution.QueryExecution.Status.StateChangeReason ?? 'Unknown error';
      throw new Error(`Query failed: ${reason}`);
    }

    if (state === 'CANCELLED') {
      throw new Error('Query was cancelled');
    }

    throw new Error(`Query ended with unexpected state: ${state}`);
  }

  /**
   * Replaces template placeholders with actual parameter values
   * @param queryTemplate - Query template with {{param}} placeholders
   * @param params - Parameter values to substitute
   * @returns Query string with substituted values
   */
  private replaceQueryParams(queryTemplate: string, params: QueryParams): string {
    let query = queryTemplate;

    for (const key of Object.keys(params)) {
      const value = params[key];
      if (value !== undefined) {
        const placeholder = `{{${key}}}`;
        query = query.replace(new RegExp(placeholder, 'g'), value);
      }
    }

    return query;
  }

  /**
   * Polls for query completion until success, failure, or timeout
   * @param queryExecutionId - ID of the query to monitor
   * @param maxRetries - Maximum number of status checks
   * @param retryDelay - Milliseconds between status checks
   * @returns Final query execution status
   * @throws Error if query times out
   */
  private async waitForQueryCompletion(
    queryExecutionId: string,
    maxRetries: number,
    retryDelay: number,
  ): Promise<AthenaQueryExecution> {
    return Core.pollUntilComplete(
      { maxAttempts: maxRetries, backoff: Core.fixedBackoff(retryDelay) },
      async (attempt) => {
        const execution = (await this.athenaService.getQueryExecution(queryExecutionId)) as AthenaQueryExecution;
        const state = execution.QueryExecution.Status.State;

        this.log(`Query status: ${state} (check ${attempt + 1}/${maxRetries})`);

        if (ATHENA_TERMINAL_STATES.has(state)) {
          return execution;
        }

        return undefined;
      },
    );
  }

  /**
   * Fetches all result pages for a completed query
   * @param queryExecutionId - ID of the completed query
   * @returns Combined results from all pages
   */
  private async fetchAllResults(queryExecutionId: string): Promise<AthenaQueryResults> {
    const allRows: { Data: { VarCharValue?: string }[] }[] = [];
    let nextToken: string | undefined = undefined;
    let isFirstPage = true;

    do {
      const results = await this.athenaService.getQueryResults(queryExecutionId, nextToken);
      const resultRows = results.ResultSet?.Rows ?? [];

      // Filter and map rows to ensure Data is defined
      const validRows = resultRows
        .filter((row): row is { Data: { VarCharValue?: string }[] } => row.Data !== undefined)
        .map((row) => ({ Data: row.Data }));

      if (isFirstPage) {
        // First page includes headers
        allRows.push(...validRows);
        isFirstPage = false;
      } else {
        // Subsequent pages skip headers (first row)
        allRows.push(...validRows.slice(1));
      }

      nextToken = results.NextToken;

      if (nextToken) {
        this.log('Fetching next page of results...');
      }
    } while (nextToken);

    this.log(`Retrieved ${allRows.length - 1} rows (excluding header)`);

    return {
      ResultSet: {
        Rows: allRows,
        ResultSetMetadata: {
          ColumnInfo: [],
        },
      },
    };
  }
}
