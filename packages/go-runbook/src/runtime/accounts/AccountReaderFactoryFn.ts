import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ResolvedAwsAccount } from '../../toolkits/common/accounts/ResolvedAwsAccount.js';

/** Builds the exact reader of a resolved logical account, with the credentials of the binding. */
export type AccountReaderFactoryFn = (
  account: ResolvedAwsAccount,
) => AWSCloudWatchLogsQueryService | Promise<AWSCloudWatchLogsQueryService>;
