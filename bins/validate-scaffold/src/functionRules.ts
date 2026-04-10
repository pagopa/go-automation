/**
 * Function Scaffold Validation Rules
 *
 * These rules validate Lambda packages under functions/*.
 * They intentionally differ from script rules because Lambda handlers
 * have a different structure and packaging flow.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import type { ScaffoldRule } from './types/index.js';

/** Finds the 1-based line number of a key in raw file content */
function findLine(content: string, key: string): number | undefined {
  const index = content.indexOf(`"${key}"`);
  if (index === -1) return undefined;
  return content.substring(0, index).split('\n').length;
}

interface FunctionContext {
  readonly functionDirName: string;
  readonly packageJsonContent: string;
  readonly packageJson: Record<string, unknown>;
  readonly handlerContent: string;
  readonly tsconfigContent: string;
  readonly esbuildContent: string;
  readonly isWrapper: boolean;
  readonly wrappedConfigPackageName: string | undefined;
  readonly wrappedMainPackageName: string | undefined;
  readonly wrappedScriptRelativePath: string | undefined;
}

async function loadFunctionContext(functionPath: string): Promise<FunctionContext | undefined> {
  try {
    const packageJsonPath = path.join(functionPath, 'package.json');
    const handlerPath = path.join(functionPath, 'src', 'handler.ts');
    const tsconfigPath = path.join(functionPath, 'tsconfig.json');
    const esbuildPath = path.join(functionPath, 'esbuild.config.mjs');

    const [packageJsonContent, handlerContent, tsconfigContent, esbuildContent] = await Promise.all([
      fs.readFile(packageJsonPath, 'utf-8'),
      fs.readFile(handlerPath, 'utf-8'),
      fs.readFile(tsconfigPath, 'utf-8'),
      fs.readFile(esbuildPath, 'utf-8'),
    ]);

    const packageJson = JSON.parse(packageJsonContent) as Record<string, unknown>;
    const wrappedConfigPackageName = handlerContent.match(/from '([^']+)\/config'/)?.[1];
    const wrappedMainPackageName = handlerContent.match(/from '([^']+)\/main'/)?.[1];
    const wrappedScriptRelativePath = tsconfigContent.match(/"\.\.\/\.\.\/scripts\/([^"]+)"/)?.[1];
    const isWrapper =
      handlerContent.includes('createLambdaHandler(') || handlerContent.includes('createLambdaHandler<');

    return {
      functionDirName: path.basename(functionPath),
      packageJsonContent,
      packageJson,
      handlerContent,
      tsconfigContent,
      esbuildContent,
      isWrapper,
      wrappedConfigPackageName,
      wrappedMainPackageName,
      wrappedScriptRelativePath,
    };
  } catch {
    return undefined;
  }
}

function getScripts(pkg: Record<string, unknown>): Record<string, string> {
  const scripts = pkg['scripts'];
  if (typeof scripts !== 'object' || scripts === null) {
    return {};
  }

  return Object.fromEntries(Object.entries(scripts).filter(([, value]) => typeof value === 'string')) as Record<
    string,
    string
  >;
}

function getDependencies(pkg: Record<string, unknown>): Record<string, string> {
  const dependencies = pkg['dependencies'];
  if (typeof dependencies !== 'object' || dependencies === null) {
    return {};
  }

  return Object.fromEntries(Object.entries(dependencies).filter(([, value]) => typeof value === 'string')) as Record<
    string,
    string
  >;
}

export const functionRules: ReadonlyArray<ScaffoldRule> = [
  // ── Base file structure ─────────────────────────────────────────────

  {
    name: 'src/handler.ts exists',
    check: 'file-exists',
    glob: 'src/handler.ts',
  },
  {
    name: 'package.json exists',
    check: 'file-exists',
    glob: 'package.json',
  },
  {
    name: 'tsconfig.json exists',
    check: 'file-exists',
    glob: 'tsconfig.json',
  },
  {
    name: 'esbuild.config.mjs exists',
    check: 'file-exists',
    glob: 'esbuild.config.mjs',
  },

  // ── handler.ts structure ────────────────────────────────────────────

  {
    name: 'handler.ts exports handler',
    check: 'file-contains',
    file: 'src/handler.ts',
    pattern: /export const handler|export async function handler/,
  },
  {
    name: 'handler.ts does not import cross-package src paths',
    check: 'file-not-contains',
    file: 'src/handler.ts',
    pattern: /from ['"][^'"]*\/src\/[^'"]*['"]/,
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
    name: 'package.json has "build" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.build',
  },
  {
    name: 'package.json has "build:typecheck" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.build:typecheck',
  },
  {
    name: 'package.json has "package" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.package',
  },
  {
    name: 'package.json has "clean" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.clean',
  },
  {
    name: 'package.json has "test-build" script',
    check: 'json-has-key',
    file: 'package.json',
    key: 'scripts.test-build',
  },
  {
    name: 'package scripts target the current function artifact paths',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'package scripts target the current function artifact paths';
      const context = await loadFunctionContext(functionPath);

      if (context === undefined) {
        return { rule: ruleName, passed: true };
      }

      const scripts = getScripts(context.packageJson);
      const expectedArtifactPath = `../../artifacts/${context.functionDirName}`;
      const expectedZipPath = `../../functions/${context.functionDirName}/function.zip`;
      const packageScript = scripts['package'];
      const testBuildScript = scripts['test-build'];

      if (packageScript === undefined) {
        return { rule: ruleName, passed: true };
      }

      const packageIsValid = packageScript.includes(expectedArtifactPath) && packageScript.includes(expectedZipPath);

      const testBuildIsValid =
        testBuildScript === undefined ||
        testBuildScript.includes('Skipping CodeBuild packaging for this function') ||
        (testBuildScript.includes(expectedArtifactPath) && testBuildScript.includes(expectedZipPath));

      if (packageIsValid && testBuildIsValid) {
        return { rule: ruleName, passed: true };
      }

      return {
        rule: ruleName,
        passed: false,
        file: 'package.json',
        line: findLine(context.packageJsonContent, 'package'),
        message: `Expected artifact paths to reference ${context.functionDirName}.`,
      };
    },
  },

  // ── tsconfig.json / esbuild.config.mjs ──────────────────────────────

  {
    name: 'tsconfig.json extends base config',
    check: 'file-contains',
    file: 'tsconfig.json',
    pattern: /tsconfig\.base\.json/,
  },
  {
    name: 'esbuild config bundles src/handler.ts',
    check: 'file-contains',
    file: 'esbuild.config.mjs',
    pattern: /entryPoints:\s*\[\s*'src\/handler\.ts'\s*\]/,
  },
  {
    name: 'esbuild config outputs handler.mjs',
    check: 'file-contains',
    file: 'esbuild.config.mjs',
    pattern: /handler\.mjs/,
  },
  {
    name: 'esbuild config writes to artifacts directory',
    check: 'file-contains',
    file: 'esbuild.config.mjs',
    pattern: /artifacts/,
  },

  // ── Wrapper-specific rules ──────────────────────────────────────────

  {
    name: 'Wrapper Lambda imports config and main from the same package',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'Wrapper Lambda imports config and main from the same package';
      const context = await loadFunctionContext(functionPath);

      if (!context?.isWrapper) {
        return { rule: ruleName, passed: true };
      }

      const configImport = context.wrappedConfigPackageName;
      const mainImport = context.wrappedMainPackageName;

      if (configImport !== undefined && mainImport !== undefined && configImport === mainImport) {
        return { rule: ruleName, passed: true };
      }

      return {
        rule: ruleName,
        passed: false,
        file: 'src/handler.ts',
        message: 'Wrapper handlers must import both /config and /main from the same workspace package.',
      };
    },
  },
  {
    name: 'Wrapper Lambda has local test harness',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'Wrapper Lambda has local test harness';
      const context = await loadFunctionContext(functionPath);

      if (!context?.isWrapper) {
        return { rule: ruleName, passed: true };
      }

      const scripts = getScripts(context.packageJson);

      try {
        await fs.access(path.join(functionPath, 'src', 'test-local.ts'));
      } catch {
        return {
          rule: ruleName,
          passed: false,
          file: 'src/test-local.ts',
          message: 'Wrapper Lambdas should expose src/test-local.ts.',
        };
      }

      if (scripts['test:local'] === undefined) {
        return {
          rule: ruleName,
          passed: false,
          file: 'package.json',
          line: findLine(context.packageJsonContent, 'scripts'),
          message: 'Wrapper Lambdas should expose a test:local script.',
        };
      }

      return { rule: ruleName, passed: true };
    },
  },
  {
    name: 'Wrapper Lambda depends on go-common via workspace protocol',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'Wrapper Lambda depends on go-common via workspace protocol';
      const context = await loadFunctionContext(functionPath);

      if (!context?.isWrapper) {
        return { rule: ruleName, passed: true };
      }

      const dependencies = getDependencies(context.packageJson);
      if (dependencies['@go-automation/go-common'] === 'workspace:*') {
        return { rule: ruleName, passed: true };
      }

      return {
        rule: ruleName,
        passed: false,
        file: 'package.json',
        line: findLine(context.packageJsonContent, '@go-automation/go-common'),
        message: 'Wrapper Lambdas should depend on @go-automation/go-common via workspace:*.',
      };
    },
  },
  {
    name: 'Wrapper Lambda depends on wrapped script via workspace protocol',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'Wrapper Lambda depends on wrapped script via workspace protocol';
      const context = await loadFunctionContext(functionPath);

      if (!context?.isWrapper) {
        return { rule: ruleName, passed: true };
      }

      const wrappedPackageName = context.wrappedConfigPackageName;
      const dependencies = getDependencies(context.packageJson);

      if (wrappedPackageName !== undefined && dependencies[wrappedPackageName] === 'workspace:*') {
        return { rule: ruleName, passed: true };
      }

      return {
        rule: ruleName,
        passed: false,
        file: 'package.json',
        line:
          wrappedPackageName !== undefined
            ? findLine(context.packageJsonContent, wrappedPackageName)
            : findLine(context.packageJsonContent, 'dependencies'),
        message: 'Wrapper Lambdas should depend on the wrapped script package via workspace:*.',
      };
    },
  },
  {
    name: 'Wrapper Lambda tsconfig references go-common and the wrapped script',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'Wrapper Lambda tsconfig references go-common and the wrapped script';
      const context = await loadFunctionContext(functionPath);

      if (!context?.isWrapper) {
        return { rule: ruleName, passed: true };
      }

      const hasGoCommonReference = context.tsconfigContent.includes('../../packages/go-common');
      const hasScriptReference = context.tsconfigContent.includes('../../scripts/');

      if (hasGoCommonReference && hasScriptReference) {
        return { rule: ruleName, passed: true };
      }

      return {
        rule: ruleName,
        passed: false,
        file: 'tsconfig.json',
        message: 'Wrapper Lambdas should reference both go-common and the wrapped script in tsconfig.json.',
      };
    },
  },
  {
    name: 'Wrapper Lambda build prebuilds the wrapped script',
    severity: 'warning',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'Wrapper Lambda build prebuilds the wrapped script';
      const context = await loadFunctionContext(functionPath);

      if (!context?.isWrapper) {
        return { rule: ruleName, passed: true };
      }

      const wrappedPackageName = context.wrappedConfigPackageName;
      const scripts = getScripts(context.packageJson);

      if (wrappedPackageName === undefined) {
        return { rule: ruleName, passed: true };
      }

      const expectedCommand = `pnpm --filter=${wrappedPackageName} build`;
      const buildScript = scripts['build'] ?? '';
      const typecheckScript = scripts['build:typecheck'] ?? '';

      if (buildScript.includes(expectedCommand) && typecheckScript.includes(expectedCommand)) {
        return { rule: ruleName, passed: true };
      }

      return {
        rule: ruleName,
        passed: false,
        file: 'package.json',
        line: findLine(context.packageJsonContent, 'build'),
        message: `Consider prebuilding ${wrappedPackageName} before bundling the Lambda.`,
      };
    },
  },
  {
    name: 'Wrapper Lambda copies configs when the wrapped script has configs',
    severity: 'warning',
    check: 'custom',
    validate: async (functionPath) => {
      const ruleName = 'Wrapper Lambda copies configs when the wrapped script has configs';
      const context = await loadFunctionContext(functionPath);

      if (context === undefined || !context.isWrapper || context.wrappedScriptRelativePath === undefined) {
        return { rule: ruleName, passed: true };
      }

      const configsPath = path.join(functionPath, '..', '..', 'scripts', context.wrappedScriptRelativePath, 'configs');

      try {
        const stats = await fs.stat(configsPath);
        if (!stats.isDirectory()) {
          return { rule: ruleName, passed: true };
        }
      } catch {
        return { rule: ruleName, passed: true };
      }

      const copiesConfigs =
        context.esbuildContent.includes('CONFIGS_SOURCE') &&
        context.esbuildContent.includes('CONFIGS_DEST') &&
        context.esbuildContent.includes('fs.cp(');

      if (copiesConfigs) {
        return { rule: ruleName, passed: true };
      }

      return {
        rule: ruleName,
        passed: false,
        file: 'esbuild.config.mjs',
        message: 'The wrapped script has a configs/ directory, but esbuild.config.mjs does not copy it.',
      };
    },
  },
];
