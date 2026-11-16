/** Account and region of the occurrence an execution analyses (EVO-AWSACCT-OPUS-01 §6.2). */
export interface AwsAccountsOccurrence {
  readonly accountId: string;
  readonly region: string;
}
