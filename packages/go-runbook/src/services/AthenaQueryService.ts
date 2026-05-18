/**
 * Structural contract for services capable of executing Athena queries.
 */
export interface AthenaQueryService {
  query(
    database: string,
    query: string,
    parameters?: ReadonlyArray<string>,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<Record<string, string>>>;
}
