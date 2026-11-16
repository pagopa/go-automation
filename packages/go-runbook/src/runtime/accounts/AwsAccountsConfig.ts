import type { AwsAccountsBinding } from './AwsAccountsBinding.js';

/** Account configuration of an execution host (EVO-AWSACCT-OPUS-01 §8.1): the `aws.account.*` keys. */
export interface AwsAccountsConfig {
  /** Raw `aws.account.directory` entries, `<product>/<account>/<environment>=<accountId>`. */
  readonly directory: ReadonlyArray<string>;
  /** `aws.account.binding`. */
  readonly binding: AwsAccountsBinding;
  /** `aws.account.environment`: environment of executions without an occurrence. */
  readonly environment?: string;
  /** `aws.account.permissionSets`: preferred SSO permission sets, most preferred first (`profiles` only). */
  readonly permissionSets?: ReadonlyArray<string>;
  /** Region of the execution (`aws.region`). */
  readonly region: string;
}
