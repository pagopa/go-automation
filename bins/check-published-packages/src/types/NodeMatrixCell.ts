/** One cell of the CI smoke matrix: a Node version, one shard of its scenarios and the scenarios of that shard. */
export interface NodeMatrixCell {
  /** Exact minimum version (e.g. `22.19.0`) or the toolchain major (`24`). */
  readonly node: string;
  /** Position of the shard among the shards of its Node version (e.g. `1/3`). */
  readonly shard: string;
  /** Comma-separated scenario ids, the value of `--scenario`. */
  readonly scenarios: string;
}
