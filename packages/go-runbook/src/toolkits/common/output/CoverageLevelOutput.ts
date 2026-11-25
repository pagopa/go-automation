/** The nodes of one level of an error tree, by outcome. */
export interface CoverageLevelOutput {
  readonly target: string;
  readonly nodes: number;
  readonly recognized: number;
  readonly unrecognized: number;
  readonly failed: number;
  /** A read that enumerates the level was incomplete: the counts are lower bounds. */
  readonly lowerBound?: boolean;
}
