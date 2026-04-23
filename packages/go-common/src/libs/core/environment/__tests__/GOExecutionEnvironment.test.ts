import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { GOCredentialSource } from '../GOCredentialSource.js';
import { GODeploymentMode } from '../GODeploymentMode.js';
import { GOExecutionEnvironment } from '../GOExecutionEnvironment.js';
import { GOExecutionEnvironmentType } from '../GOExecutionEnvironmentType.js';

type ProcessEnvSnapshot = Record<string, string | undefined>;

const DETECTION_ENV_VARS = [
  'TERM',
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'JENKINS_URL',
  'CIRCLECI',
  'TRAVIS',
  'TF_BUILD',
  'BITBUCKET_BUILD_NUMBER',
  'BUILDKITE',
  'DRONE',
  'TEAMCITY_VERSION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_LAMBDA_FUNCTION_NAME',
  'AWS_DEFAULT_REGION',
  'AWS_REGION',
  'ECS_CONTAINER_METADATA_URI',
  'ECS_CONTAINER_METADATA_URI_V4',
  'CODEBUILD_BUILD_ID',
  'GO_DEPLOYMENT_MODE',
] as const;

function restoreEnv(snapshot: ProcessEnvSnapshot): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

function clearDetectionEnv(): void {
  for (const key of DETECTION_ENV_VARS) {
    delete process.env[key];
  }
}

function restoreProperty<T extends object, K extends PropertyKey>(
  target: T,
  key: K,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

describe('GOExecutionEnvironment', () => {
  let envSnapshot: ProcessEnvSnapshot;
  let stdoutTTYDescriptor: PropertyDescriptor | undefined;
  let stdinTTYDescriptor: PropertyDescriptor | undefined;
  let cwdMock: ReturnType<typeof mock.method<typeof process, 'cwd'>> | undefined;
  const tempDirs: string[] = [];

  beforeEach(() => {
    envSnapshot = { ...process.env };
    stdoutTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    stdinTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    GOExecutionEnvironment.clearCache();
    clearDetectionEnv();
  });

  afterEach(async () => {
    GOExecutionEnvironment.clearCache();
    restoreEnv(envSnapshot);
    restoreProperty(process.stdout, 'isTTY', stdoutTTYDescriptor);
    restoreProperty(process.stdin, 'isTTY', stdinTTYDescriptor);
    cwdMock?.mock.restore();
    cwdMock = undefined;

    await Promise.all(tempDirs.map(async (dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  function setTTY(stdoutIsTTY: boolean, stdinIsTTY: boolean): void {
    Object.defineProperty(process.stdout, 'isTTY', { value: stdoutIsTTY, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: stdinIsTTY, configurable: true });
  }

  async function createNestedDir(root: string, ...segments: string[]): Promise<string> {
    const target = path.join(root, ...segments);
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  it('detects a local interactive monorepo from pnpm-workspace.yaml and exposes cached helpers', async () => {
    const root = await createTempDir('go-env-local-');
    tempDirs.push(root);
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    const nestedDir = await createNestedDir(root, 'packages', 'go-common');

    cwdMock = mock.method(process, 'cwd', () => nestedDir);
    setTTY(true, true);
    process.env['TERM'] = 'xterm-256color';

    const info = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(info.type, GOExecutionEnvironmentType.LOCAL_INTERACTIVE);
    assert.strictEqual(info.credentialSource, GOCredentialSource.SSO_PROFILE);
    assert.strictEqual(info.deploymentMode, GODeploymentMode.MONOREPO);
    assert.strictEqual(info.monorepoRoot, root);
    assert.strictEqual(info.requiresAwsProfile, true);

    GOExecutionEnvironment.clearCache();
    const cached = GOExecutionEnvironment.detect();
    assert.strictEqual(GOExecutionEnvironment.detect(), cached);
    assert.strictEqual(GOExecutionEnvironment.isInteractive(), true);
    assert.strictEqual(GOExecutionEnvironment.isAWSManaged(), false);
    assert.strictEqual(GOExecutionEnvironment.isMonorepo(), true);
    assert.strictEqual(GOExecutionEnvironment.isStandalone(), false);
    assert.strictEqual(GOExecutionEnvironment.getMonorepoRoot(), root);

    const summary = GOExecutionEnvironment.getSummary();
    assert.match(summary, /Environment: local_interactive/i);
    assert.match(summary, /Monorepo Root:/);
  });

  it('detects a generic CI environment and supports package.json workspaces discovery', async () => {
    const root = await createTempDir('go-env-ci-');
    tempDirs.push(root);
    await writeJson(path.join(root, 'package.json'), {
      private: true,
      workspaces: ['packages/*'],
    });
    const nestedDir = await createNestedDir(root, 'packages', 'go-runbook');

    cwdMock = mock.method(process, 'cwd', () => nestedDir);
    setTTY(false, false);
    process.env['CI'] = 'true';
    process.env['GITHUB_ACTIONS'] = 'true';

    const info = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(info.type, GOExecutionEnvironmentType.CI);
    assert.strictEqual(info.ciSystem, 'GitHub Actions');
    assert.strictEqual(info.credentialSource, GOCredentialSource.DEFAULT_CHAIN);
    assert.strictEqual(info.deploymentMode, GODeploymentMode.MONOREPO);
    assert.strictEqual(info.detectionDetails.hasPackageJsonWorkspaces, true);

    GOExecutionEnvironment.clearCache();
    GOExecutionEnvironment.detect();
    assert.strictEqual(GOExecutionEnvironment.isCI(), true);
  });

  it('detects AWS Lambda and honors explicit standalone deployment mode', () => {
    setTTY(false, false);
    process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'go-common-test';
    process.env['AWS_DEFAULT_REGION'] = 'eu-south-1';
    process.env['GO_DEPLOYMENT_MODE'] = 'standalone';

    const info = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(info.type, GOExecutionEnvironmentType.AWS_LAMBDA);
    assert.strictEqual(info.credentialSource, GOCredentialSource.DEFAULT_CHAIN);
    assert.strictEqual(info.awsRegion, 'eu-south-1');
    assert.strictEqual(info.lambdaFunctionName, 'go-common-test');
    assert.strictEqual(info.deploymentMode, GODeploymentMode.STANDALONE);

    GOExecutionEnvironment.clearCache();
    GOExecutionEnvironment.detect();
    assert.strictEqual(GOExecutionEnvironment.isAWSManaged(), true);
    assert.strictEqual(GOExecutionEnvironment.isStandalone(), true);
  });

  it('detects ECS and CodeBuild as AWS-managed environments', () => {
    setTTY(false, false);

    process.env['ECS_CONTAINER_METADATA_URI_V4'] = 'http://169.254.170.2/v4';
    const ecsInfo = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(ecsInfo.type, GOExecutionEnvironmentType.AWS_ECS);
    assert.strictEqual(ecsInfo.credentialSource, GOCredentialSource.DEFAULT_CHAIN);

    GOExecutionEnvironment.clearCache();
    delete process.env['ECS_CONTAINER_METADATA_URI_V4'];
    process.env['CODEBUILD_BUILD_ID'] = 'build:123';

    const codeBuildInfo = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(codeBuildInfo.type, GOExecutionEnvironmentType.AWS_CODEBUILD);
    assert.strictEqual(codeBuildInfo.credentialSource, GOCredentialSource.DEFAULT_CHAIN);
  });

  it('covers web identity, environment credentials, unknown mode, and cache invalidation', () => {
    setTTY(false, false);
    const standaloneRoot = path.join(os.tmpdir(), 'go-env-standalone-no-markers');
    cwdMock = mock.method(process, 'cwd', () => standaloneRoot);

    process.env['AWS_WEB_IDENTITY_TOKEN_FILE'] = '/tmp/token';
    const webIdentityInfo = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(webIdentityInfo.type, GOExecutionEnvironmentType.UNKNOWN);
    assert.strictEqual(webIdentityInfo.credentialSource, GOCredentialSource.WEB_IDENTITY);

    GOExecutionEnvironment.clearCache();
    delete process.env['AWS_WEB_IDENTITY_TOKEN_FILE'];
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA_TEST';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET_TEST';

    const envCredentialsInfo = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(envCredentialsInfo.credentialSource, GOCredentialSource.ENVIRONMENT);

    GOExecutionEnvironment.clearCache();
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];

    const unknownInfo = GOExecutionEnvironment.detectFresh();
    assert.strictEqual(unknownInfo.type, GOExecutionEnvironmentType.UNKNOWN);
    assert.strictEqual(unknownInfo.credentialSource, GOCredentialSource.NONE);
    assert.throws(
      () => GOExecutionEnvironment.getMonorepoRoot(),
      /getMonorepoRoot\(\) is only available in monorepo mode/,
    );

    GOExecutionEnvironment.clearCache();
    process.env['CI'] = 'true';
    const cachedCI = GOExecutionEnvironment.detect();
    process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'later-change';
    assert.strictEqual(GOExecutionEnvironment.detect(), cachedCI);

    GOExecutionEnvironment.clearCache();
    const refreshed = GOExecutionEnvironment.detect();
    assert.strictEqual(refreshed.type, GOExecutionEnvironmentType.AWS_LAMBDA);
  });
});
