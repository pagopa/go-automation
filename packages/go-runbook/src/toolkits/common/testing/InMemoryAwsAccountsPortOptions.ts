import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { AwsAccountsDirectoryPortOptions } from '../accounts/AwsAccountsDirectoryPortOptions.js';

/** Options of {@link InMemoryAwsAccountsPort}: the execution data plus the fake readers. */
export interface InMemoryAwsAccountsPortOptions extends AwsAccountsDirectoryPortOptions {
  /** Reader of each logical account; an account without one gets a fake whose methods throw. */
  readonly readers?: Readonly<Record<string, AWSCloudWatchLogsQueryService>>;
  /** Logical accounts that no credentials reach: preparing them fails with `AWS_ACCOUNT_UNREACHABLE`. */
  readonly unreachable?: ReadonlyArray<string>;
}
