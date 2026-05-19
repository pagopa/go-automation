/**
 * Structural contract for services capable of executing Athena queries.
 */
export interface AthenaQueryOptions {
  readonly parameters?: ReadonlyArray<string>;
  readonly outputLocation?: string;
  readonly signal?: AbortSignal;
}

export interface AthenaQueryService {
  query(database: string, query: string, options?: AthenaQueryOptions): Promise<ReadonlyArray<Record<string, string>>>;
}
