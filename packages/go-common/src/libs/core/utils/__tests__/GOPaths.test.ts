import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { GOPathEnvironmentVariables } from '../GOPathEnvironmentVariables.js';
import { GOPaths, GOPathType } from '../GOPaths.js';

const managedEnvVars = [
  GOPathEnvironmentVariables.BASE_DIR,
  GOPathEnvironmentVariables.DATA_DIR,
  GOPathEnvironmentVariables.INPUT_DIR,
  GOPathEnvironmentVariables.OUTPUT_DIR,
  GOPathEnvironmentVariables.CONFIG_DIR,
  GOPathEnvironmentVariables.CACHE_DIR,
] as const;

const originalEnv = new Map<string, string | undefined>(managedEnvVars.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const [name, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'go-paths-'));
}

function setPathEnv(root: string): {
  readonly dataDir: string;
  readonly inputDir: string;
  readonly outputDir: string;
  readonly configDir: string;
  readonly cacheDir: string;
} {
  const dataDir = path.join(root, 'data');
  const inputDir = path.join(root, 'inputs');
  const outputDir = path.join(root, 'outputs');
  const configDir = path.join(root, 'configs');
  const cacheDir = path.join(root, 'cache');

  process.env[GOPathEnvironmentVariables.DATA_DIR] = dataDir;
  process.env[GOPathEnvironmentVariables.INPUT_DIR] = inputDir;
  process.env[GOPathEnvironmentVariables.OUTPUT_DIR] = outputDir;
  process.env[GOPathEnvironmentVariables.CONFIG_DIR] = configDir;
  process.env[GOPathEnvironmentVariables.CACHE_DIR] = cacheDir;

  return { dataDir, inputDir, outputDir, configDir, cacheDir };
}

describe('GOPaths', () => {
  it('resolves configured directories and standard file paths', () => {
    const root = createTempRoot();
    const dirs = setPathEnv(root);
    const paths = new GOPaths({ scriptName: 'sample-script', baseDir: root });

    assert.strictEqual(paths.getScriptName(), 'sample-script');
    assert.ok(paths.getStartTime() instanceof Date);
    assert.strictEqual(paths.getBaseDir(), root);
    assert.strictEqual(paths.getDataDir(), dirs.dataDir);
    assert.strictEqual(paths.getInputsDir(), dirs.inputDir);
    assert.strictEqual(paths.getOutputsBaseDir(), dirs.outputDir);
    assert.strictEqual(paths.getDataConfigDir(), dirs.configDir);
    assert.strictEqual(paths.getCacheDir(), dirs.cacheDir);
    assert.strictEqual(paths.getConfigsDir(), paths.getLocalConfigsDir());
    assert.strictEqual(paths.getInputFilePath('input.csv'), path.join(dirs.inputDir, 'input.csv'));
    assert.strictEqual(
      paths.getCacheFilePath(path.join('runbook', 'alarm', 'event.json')),
      path.join(dirs.cacheDir, 'runbook', 'alarm', 'event.json'),
    );
    assert.strictEqual(paths.getExecutionLogFilePath(), paths.getExecutionOutputFilePath('execution.log'));
    assert.match(paths.getExecutionOutputDir(), /sample-script_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    assert.match(paths.getOutputFileName('report', 'json'), /^report_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
    assert.ok(paths.getSummary().includes('Script Name: sample-script'));
  });

  it('creates expected directories', () => {
    const root = createTempRoot();
    const dirs = setPathEnv(root);
    const paths = new GOPaths({ scriptName: 'sample-script', baseDir: root });

    const executionDir = paths.createExecutionOutputDir();
    paths.ensureDirectoriesExist();

    assert.strictEqual(fs.existsSync(executionDir), true);
    assert.strictEqual(fs.existsSync(dirs.inputDir), true);
    assert.strictEqual(fs.existsSync(dirs.outputDir), true);
    assert.strictEqual(fs.existsSync(dirs.configDir), true);
    assert.strictEqual(fs.existsSync(dirs.cacheDir), true);
  });

  it('resolves config files with source information', () => {
    const root = createTempRoot();
    const dirs = setPathEnv(root);
    const paths = new GOPaths({ scriptName: 'sample-script', baseDir: root });
    fs.mkdirSync(dirs.configDir, { recursive: true });
    const configPath = path.join(dirs.configDir, 'config.yaml');
    fs.writeFileSync(configPath, 'enabled: true\n');

    assert.strictEqual(paths.getConfigFilePath('config.yaml'), configPath);
    assert.deepStrictEqual(paths.getConfigFilePathWithInfo('config.yaml'), {
      path: configPath,
      source: 'centralized',
      directory: dirs.configDir,
    });

    const missing = paths.getConfigFilePathWithInfo('missing.yaml');
    assert.strictEqual(missing.source, 'none');
    assert.strictEqual(missing.directory, paths.getLocalConfigsDir());
  });

  it('resolves absolute, input, output, config and empty paths', () => {
    const root = createTempRoot();
    const dirs = setPathEnv(root);
    const paths = new GOPaths({ scriptName: 'sample-script', baseDir: root });
    const absolutePath = path.join(root, 'absolute.txt');

    assert.strictEqual(paths.resolvePath(null, GOPathType.INPUT), undefined);
    assert.strictEqual(paths.resolvePath(undefined, GOPathType.OUTPUT), undefined);
    assert.deepStrictEqual(paths.resolvePathWithInfo(absolutePath, GOPathType.INPUT), {
      path: absolutePath,
      isAbsolute: true,
      resolvedDir: root,
    });
    assert.deepStrictEqual(paths.resolvePathWithInfo('input.csv', GOPathType.INPUT), {
      path: path.join(dirs.inputDir, 'input.csv'),
      isAbsolute: false,
      resolvedDir: dirs.inputDir,
    });
    assert.deepStrictEqual(paths.resolvePathWithInfo('config.yaml', GOPathType.CONFIG), {
      path: path.join(paths.getLocalConfigsDir(), 'config.yaml'),
      isAbsolute: false,
      resolvedDir: paths.getLocalConfigsDir(),
    });
    assert.deepStrictEqual(paths.resolvePathWithInfo(path.join('runbook', 'event.json'), GOPathType.CACHE), {
      path: path.join(dirs.cacheDir, 'runbook', 'event.json'),
      isAbsolute: false,
      resolvedDir: dirs.cacheDir,
    });

    const output = paths.resolvePathWithInfo('report.json', GOPathType.OUTPUT);
    assert.equal(output?.isAbsolute, false);
    assert.equal(output?.resolvedDir, paths.getExecutionOutputDir());
    assert.equal(output?.path, paths.getExecutionOutputFilePath('report.json'));
  });
});
