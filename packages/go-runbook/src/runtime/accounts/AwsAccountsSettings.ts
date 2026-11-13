import type { AwsAccountsBinding } from './AwsAccountsBinding.js';

/** Raw `aws.account.*` values of a host, before validation (EVO-AWSACCT-OPUS-01 §8.1). */
export interface AwsAccountsSettings {
  /** `aws.account.directory` entries; absent or empty means no logical account is configured. */
  readonly directory?: ReadonlyArray<string>;
  /** `aws.account.binding` as typed by the user. */
  readonly binding?: string;
  /** `aws.account.environment`. */
  readonly environment?: string;
  /** `aws.account.permission.sets`, most preferred first. */
  readonly permissionSets?: ReadonlyArray<string>;
  /** Region of the execution. */
  readonly region: string;
  /** Binding used when none is configured. */
  readonly defaultBinding: AwsAccountsBinding;
}
