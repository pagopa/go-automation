/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoAIClientConfig {
  /** AI hat to use */
  readonly hat?: string;
  /** Input text or path to a file */
  readonly input?: string;
  /** Invocation mode: 'direct' (Bedrock) or 'lambda' */
  readonly goAiMode: string;
  /** Lambda function name (used in lambda mode) */
  readonly goAiLambdaName: string;
  /** AWS region */
  readonly awsRegion: string;
  /** AWS SSO profile name */
  readonly awsProfile: string;
}
