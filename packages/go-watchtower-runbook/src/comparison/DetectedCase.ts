/** A detected case of a runbook output, with the texts and the identifiers the comparison reads. */
export interface DetectedCase {
  readonly caseId: string;
  readonly description: string;
  readonly message: string;
  /** Identifiers observed for this case (its chain), or those of the output context. */
  readonly identifiers: ReadonlyArray<string>;
}
