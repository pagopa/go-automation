export interface AwsCheckEcsConfig {
  readonly awsProfiles: ReadonlyArray<string>;
  readonly awsRegion: string;
  readonly ecsClusters?: ReadonlyArray<string>;
}
