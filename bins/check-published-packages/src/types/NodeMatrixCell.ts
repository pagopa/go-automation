/** One cell of the CI smoke matrix: a Node version and the scenarios that must run on it. */
export interface NodeMatrixCell {
  /** Exact minimum version (e.g. `22.19.0`) or the toolchain major (`24`). */
  readonly node: string;
  /** Comma-separated scenario ids, the value of `--scenario`. */
  readonly scenarios: string;
}
