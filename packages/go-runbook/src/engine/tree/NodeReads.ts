/** The reads of one level for one parent. */
export interface NodeReads {
  rows: number;
  readonly present: Set<string>;
}
