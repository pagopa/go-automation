/** The occurrence a runbook analyses and the AWS context it is read from. */
export interface OccurrenceParamsInput {
  readonly alarmName: string;
  readonly alarmDatetime: string;
  readonly alarmDatetimeEnd?: string;
  readonly awsAccountId?: string;
  readonly awsRegion: string;
  readonly awsProfiles: ReadonlyArray<string>;
}
