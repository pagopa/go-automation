import type { AwsAccountsPort } from '@pagopa/go-runbook/toolkits/common';

/** Logical-account configuration of an RTA check run (EVO-AWSACCT-OPUS-01 §8.2). */
export interface RunbookCheckAccounts {
  /** Account port built with every configured profile; bound to each occurrence. */
  readonly port: AwsAccountsPort;
  /** `aws.account.binding`. */
  readonly binding: string;
  /** Preferred permission sets, in preference order. */
  readonly permissionSets: ReadonlyArray<string>;
}
