import type { AWSActiveOperationRegistry } from '@pagopa/go-aws';

import type { RunbookAthenaQueryOptions } from './RunbookAthenaQueryOptions.js';

/**
 * Athena operations a runbook may use, without SDK types.
 *
 * `AWSAthenaService` (`@pagopa/go-aws/athena`) satisfies it structurally, so
 * the engine's declaration files do not need `@aws-sdk/client-athena`.
 */
export interface RunbookAthenaPort {
  /**
   * Returns a service bound to the active-operation registry of one execution.
   *
   * @param activeOperations - Registry that tracks the queries started by the execution
   * @returns The execution-scoped service
   */
  forExecution(activeOperations: AWSActiveOperationRegistry): RunbookAthenaPort;

  /**
   * Runs a query and returns its rows.
   *
   * @param database - Athena database
   * @param query - SQL query
   * @param options - Query options
   * @returns One record per row, keyed by column name
   */
  query(
    database: string,
    query: string,
    options?: RunbookAthenaQueryOptions,
  ): Promise<ReadonlyArray<Record<string, string>>>;
}
