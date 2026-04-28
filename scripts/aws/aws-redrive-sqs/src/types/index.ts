export interface AwsRedriveSqsConfig {
  readonly awsProfile: string;
  readonly sourceQueue: string;
  readonly targetQueue: string;
  readonly limit?: number;
  readonly dryRun: boolean;
  readonly visibilityTimeout: number;
  readonly batchSize: number;
}
