export interface SendCheckEcsConfig {
  readonly awsProfiles: ReadonlyArray<string>;
  readonly ecsClusters?: ReadonlyArray<string>;
}
