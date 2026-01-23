/**
 * Execution environment information
 *
 * Contains detailed information about the detected execution
 * environment and its capabilities.
 */

import type { GOCredentialSource } from './GOCredentialSource.js';
import type { GODeploymentMode } from './GODeploymentMode.js';
import type { GOExecutionEnvironmentType } from './GOExecutionEnvironmentType.js';

/**
 * Detailed information about the execution environment
 */
export interface GOExecutionEnvironmentInfo {
  /** Detected environment type */
  readonly type: GOExecutionEnvironmentType;

  /** Whether user interaction is possible (prompts, confirmations) */
  readonly isInteractive: boolean;

  /** Whether running in an AWS-managed environment (Lambda, ECS, EC2, etc.) */
  readonly isAWSManaged: boolean;

  /** Recommended credential source for this environment */
  readonly credentialSource: GOCredentialSource;

  /** Whether the environment can prompt the user for input */
  readonly canPromptUser: boolean;

  /** Whether the environment can open a browser (for SSO login) */
  readonly canOpenBrowser: boolean;

  /** Whether aws.profile parameter should be required */
  readonly requiresAwsProfile: boolean;

  /** AWS region from environment (if available) */
  readonly awsRegion: string | undefined;

  /** Detected CI system name (if running in CI) */
  readonly ciSystem: string | undefined;

  /** AWS Lambda function name (if running in Lambda) */
  readonly lambdaFunctionName: string | undefined;

  /** Additional detection details for debugging */
  readonly detectionDetails: GOEnvironmentDetectionDetails;

  /** Deployment mode: monorepo structure or standalone */
  readonly deploymentMode: GODeploymentMode;

  /** Monorepo root path (only set when deploymentMode is MONOREPO) */
  readonly monorepoRoot: string | undefined;
}

/**
 * Detection details for debugging and logging
 */
export interface GOEnvironmentDetectionDetails {
  /** Whether stdout is a TTY */
  readonly stdoutIsTTY: boolean;

  /** Whether stdin is a TTY */
  readonly stdinIsTTY: boolean;

  /** Whether TERM environment variable is set */
  readonly hasTerminal: boolean;

  /** Whether CI environment variable is set */
  readonly hasCIVariable: boolean;

  /** Whether AWS credentials are in environment */
  readonly hasEnvCredentials: boolean;

  /** Whether web identity token is available */
  readonly hasWebIdentity: boolean;

  /** Whether ECS metadata URI is available */
  readonly hasECSMetadata: boolean;

  /** Whether Lambda environment is detected */
  readonly hasLambdaEnv: boolean;

  /** Whether CodeBuild environment is detected */
  readonly hasCodeBuildEnv: boolean;

  /** GO_DEPLOYMENT_MODE environment variable value */
  readonly envDeploymentMode: string | undefined;

  /** Whether pnpm-workspace.yaml was found */
  readonly hasPnpmWorkspace: boolean;

  /** Whether package.json with workspaces was found */
  readonly hasPackageJsonWorkspaces: boolean;

  /** Detected monorepo root path (if found) */
  readonly detectedMonorepoRoot: string | undefined;
}
