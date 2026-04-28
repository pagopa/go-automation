export interface AWSCheckEcsConfig {
  readonly awsProfiles: ReadonlyArray<string>;
  readonly awsRegion: string;
  readonly ecsClusters?: ReadonlyArray<string>;
}
