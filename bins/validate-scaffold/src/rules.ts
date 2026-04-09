/**
 * Scaffold Validation Rules
 *
 * This file defines all the rules that every script in the monorepo must satisfy.
 * To add a new rule, append an entry to the array below.
 *
 * Available check types:
 *   - file-exists        → at least one file matches the glob
 *   - file-contains      → file content matches the RegExp
 *   - file-not-contains  → file content does NOT match the RegExp
 *   - json-has-key       → JSON file has a key at dot-notation path
 *   - json-key-equals    → JSON file key equals a specific value
 *   - custom             → async function returning { rule, passed, message? }
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { extractConfigParameters } from './helpers/configAstParser.js';
import type { ScaffoldRule } from './types/index.js';

/** Packages that are inherited from the root workspace and must not be in script devDependencies */
const INHERITED_DEV_DEPENDENCIES = ['typescript', 'tsx', 'prettier', 'eslint'];

/** Finds the 1-based line number of a key in raw file content */
function findLine(content: string, key: string): number | undefined {
  const index = content.indexOf(`"${key}"`);
  if (index === -1) return undefined;
  return content.substring(0, index).split('\n').length;
}

export const scaffoldRules: ReadonlyArray<ScaffoldRule> = [
  // ── Source file structure ───────────────────────────────────────────

  {
    name: 'src/index.ts entry point exists',
    check: 'file-exists',
    glob: 'src/index.ts',
  },
  {
    name: 'src/config.ts exists',
    check: 'file-exists',
    glob: 'src/config.ts',
  },
  {
    name: 'src/main.ts exists',
    check: 'file-exists',
    glob: 'src/main.ts',
  },
  {
    name: 'README.md exists',
    check: 'file-exists',
    glob: 'README.md',
  },

  // ── Types folder structure ──────────────────────────────────────────

  {
    name: 'Config type file exists in types/',
    check: 'file-exists',
    glob: 'src/types/*Config.ts',
  },
  {
    name: 'Barrel file types/index.ts exists',
    check: 'file-exists',
    glob: 'src/types/index.ts',
  },

  // ── config.ts cleanliness ───────────────────────────────────────────

  {
    name: 'config.ts exports scriptMetadata',
    check: 'file-contains',
    file: 'src/config.ts',
    pattern: /export const scriptMetadata/,
  },
  {
    name: 'config.ts exports scriptParameters',
    check: 'file-contains',
    file: 'src/config.ts',
    pattern: /export const scriptParameters/,
  },
  {
    name: 'config.ts does not define interfaces',
    check: 'file-not-contains',
    file: 'src/config.ts',
    pattern: /^export interface/m,
  },
  {
    name: 'config.ts does not re-export config types',
    check: 'file-not-contains',
    file: 'src/config.ts',
    pattern: /^export type \{.*Config/m,
  },

  // ── index.ts wiring ─────────────────────────────────────────────────

  {
    name: 'index.ts imports from @go-automation/go-common',
    check: 'file-contains',
    file: 'src/index.ts',
    pattern: /from '@go-automation\/go-common'/,
  },
  {
    name: 'index.ts imports from ./config.js',
    check: 'file-contains',
    file: 'src/index.ts',
    pattern: /from '\.\/config\.js'/,
  },
  {
    name: 'index.ts imports from ./main.js',
    check: 'file-contains',
    file: 'src/index.ts',
    pattern: /from '\.\/main\.js'/,
  },

  // ── main.ts structure ───────────────────────────────────────────────

  {
    name: 'main.ts exports main function',
    check: 'file-contains',
    file: 'src/main.ts',
    pattern: /export async function main/,
  },
  {
    name: 'main.ts does not import config type from config.ts',
    check: 'file-not-contains',
    file: 'src/main.ts',
    pattern: /import.*Config.*from '\.\/config\.js'/,
  },

  // ── package.json fields ─────────────────────────────────────────────

  {
    name: 'package.json is private',
    check: 'json-key-equals',
    file: 'package.json',
    key: 'private',
    value: true,
  },
  {
    name: 'package.json type is "module"',
    check: 'json-key-equals',
    file: 'package.json',
    key: 'type',
    value: 'module',
  },
  {
    name: 'package.json main is "dist/index.js"',
    check: 'json-key-equals',
    file: 'package.json',
    key: 'main',
    value: 'dist/index.js',
  },
  {
    name: 'package.json depends on @go-automation/go-common',
    check: 'json-has-key',
    file: 'package.json',
    key: 'dependencies.@go-automation/go-common',
  },
  {
    name: 'package.json go-common uses workspace protocol',
    check: 'json-key-equals',
    file: 'package.json',
    key: 'dependencies.@go-automation/go-common',
    value: 'workspace:*',
  },
  {
    name: 'package.json has "build" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.build',
  },
  {
    name: 'package.json has "start" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.start',
  },
  {
    name: 'package.json has "dev" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.dev',
  },
  {
    name: 'package.json has "watch" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.watch',
  },
  {
    name: 'package.json has "clean" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.clean',
  },

  // ── tsconfig.json ───────────────────────────────────────────────────

  {
    name: 'tsconfig.json exists',
    check: 'file-exists',
    glob: 'tsconfig.json',
  },
  {
    name: 'tsconfig.json extends base config',
    check: 'file-contains',
    file: 'tsconfig.json',
    pattern: /tsconfig\.base\.json/,
  },
  {
    name: 'tsconfig.json has composite: true',
    check: 'file-contains',
    file: 'tsconfig.json',
    pattern: /"composite":\s*true/,
  },
  {
    name: 'tsconfig.json references go-common',
    check: 'file-contains',
    file: 'tsconfig.json',
    pattern: /go-common/,
  },

  // ── Dependency hygiene ─────────────────────────────────────────────

  {
    name: 'No direct @aws-sdk/* dependencies (use go-common)',
    severity: 'warning',
    check: 'custom',
    validate: async (scriptPath) => {
      const pkgPath = path.join(scriptPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg: Record<string, unknown> = JSON.parse(content) as Record<string, unknown>;
      const deps = pkg['dependencies'];
      if (typeof deps !== 'object' || deps === null) {
        return { rule: 'No direct @aws-sdk/* dependencies (use go-common)', passed: true };
      }
      const awsSdkPackages = Object.keys(deps as Record<string, unknown>).filter((key) => key.startsWith('@aws-sdk/'));
      if (awsSdkPackages.length > 0) {
        const firstPkg = awsSdkPackages[0];
        return {
          rule: 'No direct @aws-sdk/* dependencies (use go-common)',
          passed: false,
          file: 'package.json',
          line: firstPkg !== undefined ? findLine(content, firstPkg) : undefined,
          message: `Found @aws-sdk/* in dependencies: ${awsSdkPackages.join(', ')}. Use go-common instead.`,
        };
      }
      return { rule: 'No direct @aws-sdk/* dependencies (use go-common)', passed: true };
    },
  },
  {
    name: 'No inherited devDependencies from root workspace',
    check: 'custom',
    validate: async (scriptPath) => {
      const pkgPath = path.join(scriptPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg: Record<string, unknown> = JSON.parse(content) as Record<string, unknown>;
      const devDeps = pkg['devDependencies'];
      if (typeof devDeps !== 'object' || devDeps === null) {
        return { rule: 'No inherited devDependencies from root workspace', passed: true };
      }
      const found = Object.keys(devDeps as Record<string, unknown>).filter((key) =>
        INHERITED_DEV_DEPENDENCIES.includes(key),
      );
      if (found.length > 0) {
        const firstPkg = found[0];
        return {
          rule: 'No inherited devDependencies from root workspace',
          passed: false,
          file: 'package.json',
          line: firstPkg !== undefined ? findLine(content, firstPkg) : undefined,
          message: `Found packages inherited from root: ${found.join(', ')}. Remove them — they come from the workspace root.`,
        };
      }
      return { rule: 'No inherited devDependencies from root workspace', passed: true };
    },
  },

  // ── README content quality ────────────────────────────────────────

  {
    name: 'README documents all config parameters',
    severity: 'warning',
    check: 'custom',
    validate: async (scriptPath) => {
      const ruleName = 'README documents all config parameters';
      const readmePath = path.join(scriptPath, 'README.md');

      let readme: string;
      try {
        readme = await fs.readFile(readmePath, 'utf-8');
      } catch {
        return { rule: ruleName, passed: true }; // README missing is caught by another rule
      }

      const parameters = await extractConfigParameters(scriptPath);
      if (parameters.length === 0) {
        return { rule: ruleName, passed: true };
      }

      const readmeLower = readme.toLowerCase();
      const missing: string[] = [];

      for (const param of parameters) {
        const flagLower = param.cliFlag.toLowerCase();
        const nameLower = param.name.toLowerCase();
        // Check if the CLI flag or the raw parameter name appears in the README
        if (!readmeLower.includes(flagLower) && !readmeLower.includes(nameLower)) {
          missing.push(param.cliFlag);
        }
      }

      if (missing.length > 0) {
        return {
          rule: ruleName,
          passed: false,
          file: 'README.md',
          message: `Parameters not documented: ${missing.join(', ')}`,
        };
      }

      return { rule: ruleName, passed: true };
    },
  },
  {
    name: 'README documents AWS services used',
    severity: 'warning',
    check: 'custom',
    validate: async (scriptPath) => {
      const ruleName = 'README documents AWS services used';
      const readmePath = path.join(scriptPath, 'README.md');
      const pkgPath = path.join(scriptPath, 'package.json');

      let readme: string;
      try {
        readme = await fs.readFile(readmePath, 'utf-8');
      } catch {
        return { rule: ruleName, passed: true };
      }

      let pkgContent: string;
      try {
        pkgContent = await fs.readFile(pkgPath, 'utf-8');
      } catch {
        return { rule: ruleName, passed: true };
      }

      const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
      const deps = pkg['dependencies'];
      if (typeof deps !== 'object' || deps === null) {
        return { rule: ruleName, passed: true };
      }

      // Map @aws-sdk/client-* packages to service names
      const awsServiceMap: ReadonlyArray<readonly [string, string]> = [
        ['@aws-sdk/client-cloudwatch', 'CloudWatch'],
        ['@aws-sdk/client-s3', 'S3'],
        ['@aws-sdk/client-athena', 'Athena'],
        ['@aws-sdk/client-lambda', 'Lambda'],
        ['@aws-sdk/client-dynamodb', 'DynamoDB'],
        ['@aws-sdk/client-sqs', 'SQS'],
        ['@aws-sdk/client-sns', 'SNS'],
        ['@aws-sdk/client-ses', 'SES'],
        ['@aws-sdk/client-sts', 'STS'],
        ['@aws-sdk/client-iam', 'IAM'],
        ['@aws-sdk/client-secrets-manager', 'Secrets Manager'],
        ['@aws-sdk/client-ssm', 'SSM'],
        ['@aws-sdk/client-bedrock-runtime', 'Bedrock'],
        ['@aws-sdk/client-cloudformation', 'CloudFormation'],
        ['@aws-sdk/client-ec2', 'EC2'],
        ['@aws-sdk/client-ecs', 'ECS'],
        ['@aws-sdk/client-eventbridge', 'EventBridge'],
        ['@aws-sdk/client-kinesis', 'Kinesis'],
        ['@aws-sdk/client-cloudwatch-logs', 'CloudWatch Logs'],
      ];

      const depKeys = new Set(Object.keys(deps as Record<string, unknown>));
      const readmeLower = readme.toLowerCase();
      const missing: string[] = [];

      for (const [pkg, service] of awsServiceMap) {
        if (depKeys.has(pkg) && !readmeLower.includes(service.toLowerCase())) {
          missing.push(service);
        }
      }

      if (missing.length > 0) {
        return {
          rule: ruleName,
          passed: false,
          file: 'README.md',
          message: `AWS services not documented: ${missing.join(', ')}`,
        };
      }

      return { rule: ruleName, passed: true };
    },
  },
  {
    name: 'README has required sections',
    severity: 'warning',
    check: 'custom',
    validate: async (scriptPath) => {
      const ruleName = 'README has required sections';
      const readmePath = path.join(scriptPath, 'README.md');

      let readme: string;
      try {
        readme = await fs.readFile(readmePath, 'utf-8');
      } catch {
        return { rule: ruleName, passed: true };
      }

      const requiredSections = ['Configurazione', 'Prerequisiti', 'Utilizzo'];
      const readmeLower = readme.toLowerCase();
      const missing: string[] = [];

      for (const section of requiredSections) {
        // Match ## heading (any level h2+)
        const headingPattern = new RegExp(`^#{2,}\\s+${section.toLowerCase()}`, 'm');
        if (!headingPattern.test(readmeLower)) {
          missing.push(section);
        }
      }

      if (missing.length > 0) {
        return {
          rule: ruleName,
          passed: false,
          file: 'README.md',
          message: `Missing required sections: ${missing.join(', ')}`,
        };
      }

      return { rule: ruleName, passed: true };
    },
  },
];
