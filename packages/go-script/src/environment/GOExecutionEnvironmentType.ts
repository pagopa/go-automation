/**
 * Execution environment types
 *
 * Identifies where the script is running to determine
 * appropriate credential handling and user interaction.
 */
export enum GOExecutionEnvironmentType {
  /** Local terminal with user present (can prompt, can open browser) */
  LOCAL_INTERACTIVE = 'local_interactive',

  /** CI/CD pipeline (no user interaction possible) */
  CI = 'ci',

  /** AWS Lambda function */
  AWS_LAMBDA = 'aws_lambda',

  /** AWS ECS/Fargate task */
  AWS_ECS = 'aws_ecs',

  /** AWS EC2 instance with instance profile */
  AWS_EC2 = 'aws_ec2',

  /** AWS CodeBuild */
  AWS_CODEBUILD = 'aws_codebuild',

  /** Unknown environment */
  UNKNOWN = 'unknown',
}
