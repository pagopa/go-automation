import type { AWSActiveOperationRegistry, AWSProfileSet } from '@pagopa/go-aws';
import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { AwsAccountsDirectoryPortOptions } from '../../toolkits/common/accounts/AwsAccountsDirectoryPortOptions.js';
import type { AwsAccountsBinding } from './AwsAccountsBinding.js';
import type { AwsAccountsDiagnosticFn } from './AwsAccountsDiagnosticFn.js';

/** Options of a {@link RuntimeAwsAccountsPort} (EVO-AWSACCT-OPUS-01 §6.1). */
export interface RuntimeAwsAccountsPortOptions extends AwsAccountsDirectoryPortOptions {
  readonly binding: AwsAccountsBinding;
  /** Every configured profile (`profiles` binding): a logical account may live outside the occurrence account. */
  readonly profiles?: AWSProfileSet;
  /** CloudWatch Logs reader with the monitoring identity (`oam` binding). */
  readonly monitoring?: AWSCloudWatchLogsQueryService;
  /** Preferred SSO permission sets, most preferred first. */
  readonly permissionSets?: ReadonlyArray<string>;
  /** Local diagnostic sink (chosen profile, unresolved identities); never part of an error or output. */
  readonly diagnostics?: AwsAccountsDiagnosticFn;
  /** Remote operations of the occurrence, stopped by the caller. */
  readonly activeOperations?: AWSActiveOperationRegistry;
}
