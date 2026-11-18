/** A CloudWatch Logs query issued by a runbook under test. */
export interface LoggedQuery {
  /** Log groups of the query. */
  readonly groups: ReadonlyArray<string>;
  /** Query string. */
  readonly query: string;
  /** Log group resolution mode requested by the step. */
  readonly resolutionMode?: string;
}
