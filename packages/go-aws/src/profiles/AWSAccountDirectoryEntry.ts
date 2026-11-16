/** One entry of an account directory: which AWS account plays a logical account in one environment. */
export interface AWSAccountDirectoryEntry {
  /** Logical account, `<product>/<account>` (for example `send/core`). */
  readonly logicalAccount: string;
  /** Environment the entry belongs to (for example `prod`, `uat`). */
  readonly environment: string;
  /** 12-digit AWS account id. */
  readonly accountId: string;
}
