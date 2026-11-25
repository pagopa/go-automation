/** Numbered entries of a composed text and the lines that always close it. */
export interface AnalysisDraftParts {
  readonly noteEntries: ReadonlyArray<string>;
  readonly coverageLines: ReadonlyArray<string>;
  readonly detailEntries: ReadonlyArray<string>;
}
