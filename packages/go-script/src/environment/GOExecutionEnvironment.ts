/**
 * GOExecutionEnvironment
 *
 * Detects the execution environment and determines appropriate
 * credential handling and user interaction capabilities.
 *
 * @example
 * ```typescript
 * const env = GOExecutionEnvironment.detect();
 *
 * if (env.isInteractive) {
 *   // Can prompt user, can open browser for SSO
 *   await credentialsManager.ensureValidCredentials(profile);
 * } else if (env.isAWSManaged) {
 *   // Use default credential chain (IAM role)
 *   const client = new S3Client({});
 * } else {
 *   // CI without AWS - need explicit credentials
 *   throw new Error('AWS credentials required');
 * }
 * ```
 */

import fs from 'fs';
import path from 'path';

import { GOCredentialSource } from './GOCredentialSource.js';
import { GODeploymentMode } from './GODeploymentMode.js';
import type { GOEnvironmentDetectionDetails, GOExecutionEnvironmentInfo } from './GOExecutionEnvironmentInfo.js';
import { GOExecutionEnvironmentType } from './GOExecutionEnvironmentType.js';

/**
 * Environment variable for forcing deployment mode
 */
const GO_DEPLOYMENT_MODE_ENV = 'GO_DEPLOYMENT_MODE';

/**
 * Environment variable that pins the go-automation root explicitly.
 * Takes precedence over the upward search from the working directory.
 */
const GO_ROOT_DIR_ENV = 'GO_ROOT_DIR';

/**
 * `package.json` name that identifies the go-automation monorepo root.
 * A generic pnpm/npm workspace of another repository is NOT a go-automation root:
 * treating it as one would make GOPaths write `data/` into a consumer repository.
 */
const GO_AUTOMATION_ROOT_PACKAGE_NAME = 'go-automation';

/**
 * Marker file that identifies a go-automation root regardless of its `package.json`
 * (e.g. a checkout or an artifact whose root manifest has a different name).
 */
const GO_AUTOMATION_ROOT_MARKER = '.go-automation-root';

/**
 * Known CI system environment variables
 */
const CI_SYSTEMS: ReadonlyArray<{ readonly envVar: string; readonly name: string }> = [
  { envVar: 'GITHUB_ACTIONS', name: 'GitHub Actions' },
  { envVar: 'GITLAB_CI', name: 'GitLab CI' },
  { envVar: 'JENKINS_URL', name: 'Jenkins' },
  { envVar: 'CIRCLECI', name: 'CircleCI' },
  { envVar: 'TRAVIS', name: 'Travis CI' },
  { envVar: 'TF_BUILD', name: 'Azure Pipelines' },
  { envVar: 'BITBUCKET_BUILD_NUMBER', name: 'Bitbucket Pipelines' },
  { envVar: 'BUILDKITE', name: 'Buildkite' },
  { envVar: 'DRONE', name: 'Drone CI' },
  { envVar: 'TEAMCITY_VERSION', name: 'TeamCity' },
];

/**
 * Execution environment detector
 *
 * Provides static methods to detect the current execution environment
 * and determine appropriate AWS credential handling.
 */
export class GOExecutionEnvironment {
  /** Cached detection result */
  private static cachedInfo: GOExecutionEnvironmentInfo | undefined;

  /**
   * Detect the current execution environment
   *
   * Results are cached for performance. Use `detectFresh()` to force re-detection.
   *
   * @returns Environment information with capabilities and recommended settings
   */
  public static detect(): GOExecutionEnvironmentInfo {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    this.cachedInfo = this.detectFresh();
    return this.cachedInfo;
  }

  /**
   * Returns a copy of `info` bound to an explicit go-automation root.
   *
   * The shared detection cache and the process environment are not modified: the
   * explicit root applies only to the caller (e.g. one `GOPaths`/`GOScript` instance).
   *
   * @param info - Detected environment information
   * @param rootDir - Explicit go-automation root (relative paths resolve against cwd)
   * @returns Environment information in monorepo mode rooted at `rootDir`
   *
   * @example
   * ```typescript
   * const env = GOExecutionEnvironment.withRoot(GOExecutionEnvironment.detect(), '/repos/go-automation');
   * env.monorepoRoot; // '/repos/go-automation'
   * ```
   */
  public static withRoot(info: GOExecutionEnvironmentInfo, rootDir: string): GOExecutionEnvironmentInfo {
    const root = this.describeMonorepoRoot(path.resolve(rootDir));
    return {
      ...info,
      deploymentMode: GODeploymentMode.MONOREPO,
      monorepoRoot: root.root,
      detectionDetails: {
        ...info.detectionDetails,
        hasPnpmWorkspace: root.hasPnpmWorkspace,
        hasPackageJsonWorkspaces: root.hasPackageJsonWorkspaces,
        detectedMonorepoRoot: root.root,
      },
    };
  }

  /**
   * Force fresh detection (bypasses cache)
   *
   * @returns Environment information with capabilities and recommended settings
   */
  public static detectFresh(): GOExecutionEnvironmentInfo {
    const details = this.gatherDetectionDetails();
    const type = this.determineEnvironmentType(details);
    const credentialSource = this.determineCredentialSource(type, details);
    const ciSystem = this.detectCISystem();
    const deploymentMode = this.determineDeploymentMode(details);

    const isInteractive = type === GOExecutionEnvironmentType.LOCAL_INTERACTIVE;
    const isAWSManaged = this.isAWSManagedEnvironment(type);

    return {
      type,
      isInteractive,
      isAWSManaged,
      credentialSource,
      canPromptUser: isInteractive,
      canOpenBrowser: isInteractive,
      requiresAwsProfile: credentialSource === GOCredentialSource.SSO_PROFILE,
      awsRegion: process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'],
      ciSystem,
      lambdaFunctionName: process.env['AWS_LAMBDA_FUNCTION_NAME'],
      detectionDetails: details,
      deploymentMode,
      monorepoRoot: deploymentMode === GODeploymentMode.MONOREPO ? details.detectedMonorepoRoot : undefined,
    };
  }

  /**
   * Clear cached detection result
   *
   * Useful for testing or when environment changes dynamically.
   */
  public static clearCache(): void {
    this.cachedInfo = undefined;
  }

  /**
   * Check if currently in an interactive environment
   */
  public static isInteractive(): boolean {
    return this.detect().isInteractive;
  }

  /**
   * Check if currently in an AWS-managed environment
   */
  public static isAWSManaged(): boolean {
    return this.detect().isAWSManaged;
  }

  /**
   * Check if currently in a CI environment
   */
  public static isCI(): boolean {
    return this.detect().type === GOExecutionEnvironmentType.CI;
  }

  /**
   * Check if currently in monorepo deployment mode
   */
  public static isMonorepo(): boolean {
    return this.detect().deploymentMode === GODeploymentMode.MONOREPO;
  }

  /**
   * Check if currently in standalone deployment mode
   */
  public static isStandalone(): boolean {
    return this.detect().deploymentMode === GODeploymentMode.STANDALONE;
  }

  /**
   * Get the monorepo root path
   *
   * @throws Error if not in monorepo mode
   * @returns Monorepo root path
   */
  public static getMonorepoRoot(): string {
    const info = this.detect();
    if (info.deploymentMode !== GODeploymentMode.MONOREPO || !info.monorepoRoot) {
      throw new Error(
        `getMonorepoRoot() is only available in monorepo mode. Current deployment mode: ${info.deploymentMode}`,
      );
    }
    return info.monorepoRoot;
  }

  /**
   * Get a human-readable summary of the detected environment
   */
  public static getSummary(): string {
    const info = this.detect();
    const lines: string[] = [
      `Environment: ${info.type}`,
      `Deployment Mode: ${info.deploymentMode}`,
      `Interactive: ${info.isInteractive}`,
      `AWS Managed: ${info.isAWSManaged}`,
      `Credential Source: ${info.credentialSource}`,
      `Requires aws.profile: ${info.requiresAwsProfile}`,
    ];

    if (info.monorepoRoot) {
      lines.push(`Monorepo Root: ${info.monorepoRoot}`);
    }

    if (info.ciSystem) {
      lines.push(`CI System: ${info.ciSystem}`);
    }

    if (info.awsRegion) {
      lines.push(`AWS Region: ${info.awsRegion}`);
    }

    if (info.lambdaFunctionName) {
      lines.push(`Lambda Function: ${info.lambdaFunctionName}`);
    }

    return lines.join('\n');
  }

  // ============================================================================
  // Private Detection Methods
  // ============================================================================

  /**
   * Gather all detection signals from the environment
   */
  private static gatherDetectionDetails(): GOEnvironmentDetectionDetails {
    const monorepoInfo = this.findMonorepoRoot();

    return {
      stdoutIsTTY: process.stdout.isTTY ?? false,
      stdinIsTTY: process.stdin.isTTY ?? false,
      hasTerminal: !!process.env['TERM'],
      hasCIVariable: !!process.env['CI'],
      hasEnvCredentials: !!process.env['AWS_ACCESS_KEY_ID'] && !!process.env['AWS_SECRET_ACCESS_KEY'],
      hasWebIdentity: !!process.env['AWS_WEB_IDENTITY_TOKEN_FILE'],
      hasECSMetadata: !!process.env['ECS_CONTAINER_METADATA_URI_V4'] || !!process.env['ECS_CONTAINER_METADATA_URI'],
      hasLambdaEnv: !!process.env['AWS_LAMBDA_FUNCTION_NAME'],
      hasCodeBuildEnv: !!process.env['CODEBUILD_BUILD_ID'],
      envDeploymentMode: process.env[GO_DEPLOYMENT_MODE_ENV],
      hasPnpmWorkspace: monorepoInfo.hasPnpmWorkspace,
      hasPackageJsonWorkspaces: monorepoInfo.hasPackageJsonWorkspaces,
      detectedMonorepoRoot: monorepoInfo.root,
    };
  }

  /**
   * Determine the environment type based on detection signals
   */
  private static determineEnvironmentType(details: GOEnvironmentDetectionDetails): GOExecutionEnvironmentType {
    // AWS Lambda - highest priority
    if (details.hasLambdaEnv) {
      return GOExecutionEnvironmentType.AWS_LAMBDA;
    }

    // AWS ECS/Fargate
    if (details.hasECSMetadata) {
      return GOExecutionEnvironmentType.AWS_ECS;
    }

    // AWS CodeBuild
    if (details.hasCodeBuildEnv) {
      return GOExecutionEnvironmentType.AWS_CODEBUILD;
    }

    // CI environment (generic)
    if (details.hasCIVariable || this.detectCISystem() !== undefined) {
      return GOExecutionEnvironmentType.CI;
    }

    // Local interactive (TTY available)
    if (details.stdoutIsTTY && details.stdinIsTTY) {
      return GOExecutionEnvironmentType.LOCAL_INTERACTIVE;
    }

    // Unknown - might be piped or redirected
    return GOExecutionEnvironmentType.UNKNOWN;
  }

  /**
   * Determine the appropriate credential source for the environment
   */
  private static determineCredentialSource(
    type: GOExecutionEnvironmentType,
    details: GOEnvironmentDetectionDetails,
  ): GOCredentialSource {
    // AWS managed environments use default chain (IAM roles)
    if (this.isAWSManagedEnvironment(type)) {
      return GOCredentialSource.DEFAULT_CHAIN;
    }

    // Web identity token (OIDC federation, EKS)
    if (details.hasWebIdentity) {
      return GOCredentialSource.WEB_IDENTITY;
    }

    // Explicit environment credentials
    if (details.hasEnvCredentials) {
      return GOCredentialSource.ENVIRONMENT;
    }

    // Local interactive - use SSO profile
    if (type === GOExecutionEnvironmentType.LOCAL_INTERACTIVE) {
      return GOCredentialSource.SSO_PROFILE;
    }

    // CI without credentials - might need to fail or use default chain
    if (type === GOExecutionEnvironmentType.CI) {
      // Try default chain as last resort (might have IAM role)
      return GOCredentialSource.DEFAULT_CHAIN;
    }

    return GOCredentialSource.NONE;
  }

  /**
   * Detect which CI system is running (if any)
   */
  private static detectCISystem(): string | undefined {
    for (const ci of CI_SYSTEMS) {
      if (process.env[ci.envVar]) {
        return ci.name;
      }
    }
    return undefined;
  }

  /**
   * Check if environment type is AWS-managed
   */
  private static isAWSManagedEnvironment(type: GOExecutionEnvironmentType): boolean {
    return (
      type === GOExecutionEnvironmentType.AWS_LAMBDA ||
      type === GOExecutionEnvironmentType.AWS_ECS ||
      type === GOExecutionEnvironmentType.AWS_EC2 ||
      type === GOExecutionEnvironmentType.AWS_CODEBUILD
    );
  }

  /**
   * Find the go-automation monorepo root.
   *
   * Resolution order:
   * 1. `GO_ROOT_DIR` environment variable (explicit root)
   * 2. Upward search from cwd for a `.go-automation-root` marker file or a
   *    `package.json` named `go-automation`
   *
   * An explicit root given in code (`GOScript({ paths: { rootDir } })`) does not go
   * through this search: it is applied per instance with {@link withRoot}.
   *
   * Any other workspace (a `pnpm-workspace.yaml` or a `package.json` with
   * `workspaces` belonging to another repository) is ignored: in that case the
   * script runs in standalone mode.
   */
  private static findMonorepoRoot(): {
    readonly root: string | undefined;
    readonly hasPnpmWorkspace: boolean;
    readonly hasPackageJsonWorkspaces: boolean;
  } {
    const explicitRoot = process.env[GO_ROOT_DIR_ENV]?.trim();
    if (explicitRoot !== undefined && explicitRoot !== '') {
      return this.describeMonorepoRoot(path.resolve(explicitRoot));
    }

    let currentDir = process.cwd();
    const fsRoot = path.parse(currentDir).root;

    while (currentDir !== fsRoot) {
      if (
        fs.existsSync(path.join(currentDir, GO_AUTOMATION_ROOT_MARKER)) ||
        this.readPackageJson(currentDir)?.name === GO_AUTOMATION_ROOT_PACKAGE_NAME
      ) {
        return this.describeMonorepoRoot(currentDir);
      }
      currentDir = path.dirname(currentDir);
    }

    return {
      root: undefined,
      hasPnpmWorkspace: false,
      hasPackageJsonWorkspaces: false,
    };
  }

  /**
   * Describes the workspace markers present in a go-automation root directory.
   */
  private static describeMonorepoRoot(root: string): {
    readonly root: string;
    readonly hasPnpmWorkspace: boolean;
    readonly hasPackageJsonWorkspaces: boolean;
  } {
    return {
      root,
      hasPnpmWorkspace: fs.existsSync(path.join(root, 'pnpm-workspace.yaml')),
      hasPackageJsonWorkspaces: this.readPackageJson(root)?.workspaces !== undefined,
    };
  }

  /**
   * Reads the `name` and `workspaces` fields of `dir/package.json`, if present and valid.
   */
  private static readPackageJson(dir: string): { readonly name?: unknown; readonly workspaces?: unknown } | undefined {
    const packageJsonPath = path.join(dir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    } catch {
      // Invalid package.json: not a root marker
      return undefined;
    }
  }

  /**
   * Determine deployment mode based on detection details
   *
   * Priority:
   * 1. GO_DEPLOYMENT_MODE env → explicit value
   * 2. go-automation root found (GO_ROOT_DIR or package.json name) → MONOREPO
   * 3. Default → STANDALONE
   */
  private static determineDeploymentMode(details: GOEnvironmentDetectionDetails): GODeploymentMode {
    // Priority 1: Explicit environment variable
    const envMode = details.envDeploymentMode?.toLowerCase();

    if (envMode === 'monorepo') {
      return GODeploymentMode.MONOREPO;
    }
    if (envMode === 'standalone') {
      return GODeploymentMode.STANDALONE;
    }

    // Priority 2: go-automation root detected
    if (details.detectedMonorepoRoot !== undefined) {
      return GODeploymentMode.MONOREPO;
    }

    // Priority 3: Default to standalone
    return GODeploymentMode.STANDALONE;
  }
}
