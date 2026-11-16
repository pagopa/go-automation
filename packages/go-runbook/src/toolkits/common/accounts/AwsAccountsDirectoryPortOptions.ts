import type { AWSAccountDirectoryEntry } from '@pagopa/go-aws/profiles';

import type { AwsAccountsOccurrence } from './AwsAccountsOccurrence.js';

/** Execution data of an {@link AwsAccountsDirectoryPort} (EVO-AWSACCT-OPUS-01 §6.2, §8). */
export interface AwsAccountsDirectoryPortOptions {
  /** Validated account directory of the execution. */
  readonly directory: ReadonlyArray<AWSAccountDirectoryEntry>;
  /** Region of the execution. */
  readonly region: string;
  /** Account and region of the occurrence, when the execution analyses one. */
  readonly occurrence?: AwsAccountsOccurrence;
  /** Environment of an execution without an occurrence (`aws.account.environment`). */
  readonly environment?: string;
}
