/** Options a runbook passes to an Athena query: the subset of `AWSAthenaQueryOptions` that runbooks use. */
export interface RunbookAthenaQueryOptions {
  /** Positional execution parameters bound to `?` placeholders. */
  readonly parameters?: ReadonlyArray<string>;
  /** S3 location for query results. */
  readonly outputLocation?: string;
  /** Abort signal of the runbook execution. */
  readonly signal?: AbortSignal;
}
