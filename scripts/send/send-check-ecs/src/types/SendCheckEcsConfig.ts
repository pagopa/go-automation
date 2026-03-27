export interface SendCheckEcsConfig {
  readonly awsProfiles: ReadonlyArray<string>;
  readonly awsRegion?: string;
  readonly ecsClusters?: ReadonlyArray<string>;
}
