import type { AwsAccountSource } from './AwsAccountSource.js';

/** One account to read in an execution, with the local profile when one is configured. */
export interface AwsAccountTarget {
  readonly account: AwsAccountSource;
  readonly region: string;
  /** Absent in cloud execution: the account is read through OAM. */
  readonly profile?: string;
}
