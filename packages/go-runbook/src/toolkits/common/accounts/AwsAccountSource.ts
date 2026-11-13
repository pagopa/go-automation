/** An AWS account a runbook reads, with the local profiles that can reach it. */
export interface AwsAccountSource {
  /** Short name used in rows, variables and messages (for example `core`). */
  readonly name: string;
  /** 12-digit account id, the OAM target in cloud execution. */
  readonly accountId: string;
  /** Local profiles that reach the account, in order of preference. */
  readonly profiles: ReadonlyArray<string>;
}
