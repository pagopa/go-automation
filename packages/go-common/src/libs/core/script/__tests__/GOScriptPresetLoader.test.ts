import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import type { GOConfigSchema } from '../../config/GOConfigSchema.js';
import { GOPathEnvironmentVariables } from '../../utils/GOPathEnvironmentVariables.js';
import { GOPaths } from '../../utils/GOPaths.js';
import { GOScriptPresetLoader } from '../GOScriptPresetLoader.js';

const managedEnvVars = [GOPathEnvironmentVariables.CONFIG_DIR] as const;
const originalEnv = new Map<string, string | undefined>(managedEnvVars.map((name) => [name, process.env[name]]));
const tempRoots: string[] = [];

afterEach(() => {
  for (const [name, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createPresetTestContext(): { readonly root: string; readonly configDir: string; readonly paths: GOPaths } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-presets-loader-'));
  tempRoots.push(root);
  const configDir = path.join(root, 'configs');
  fs.mkdirSync(configDir, { recursive: true });
  process.env[GOPathEnvironmentVariables.CONFIG_DIR] = configDir;
  return {
    root,
    configDir,
    paths: new GOPaths({ scriptName: 'preset-test', baseDir: root }),
  };
}

function createSchema(): GOConfigSchema {
  return {
    getAllParameters: () => [
      { name: 'athena.database', aliases: [] },
      { name: 'athena.workgroup', aliases: [] },
      { name: 'analysis.rules', aliases: [] },
      { name: 'output.format', aliases: [] },
    ],
  } as unknown as GOConfigSchema;
}

describe('GOScriptPresetLoader', () => {
  it('loads wrapper presets from the default presets.yaml file', () => {
    const { configDir, paths } = createPresetTestContext();
    fs.writeFileSync(
      path.join(configDir, 'presets.yaml'),
      [
        'version: 1',
        'allowUnknownKeys: true',
        'presets:',
        '  - name: tppmessages',
        '    values:',
        '      athena:',
        '        database: pn_analytics',
        '        workgroup: primary',
        '      analysis:',
        '        rules:',
        '          - rule-a',
        '          - rule-b',
      ].join('\n'),
    );

    const preset = new GOScriptPresetLoader().loadSelectedPreset({
      presetName: 'tppmessages',
      paths,
      schema: createSchema(),
    });

    assert.strictEqual(preset.name, 'tppmessages');
    assert.strictEqual(preset.sourceDisplayPath, 'presets.yaml');
    assert.strictEqual(preset.sourcePath, fs.realpathSync(path.join(configDir, 'presets.yaml')));
    assert.strictEqual(preset.allowUnknownKeys, true);
    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
    assert.strictEqual(preset.values.get('athena.workgroup'), 'primary');
    assert.deepStrictEqual(preset.values.get('analysis.rules'), ['rule-a', 'rule-b']);
    assert.deepStrictEqual(preset.unknownKeys, []);
  });

  it('loads top-level map presets from a custom config file', () => {
    const { configDir, paths } = createPresetTestContext();
    fs.writeFileSync(
      path.join(configDir, 'presets.prod.yaml'),
      ['tppmessages:', '  athena.database: pn_analytics', '  output:', '    format: csv'].join('\n'),
    );

    const preset = new GOScriptPresetLoader().loadSelectedPreset({
      presetName: 'tppmessages',
      presetFile: 'presets.prod.yaml',
      paths,
      schema: createSchema(),
    });

    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
    assert.strictEqual(preset.values.get('output.format'), 'csv');
    assert.strictEqual(preset.sourceDisplayPath, 'presets.prod.yaml');
    assert.strictEqual(preset.allowUnknownKeys, true);
  });

  it('loads top-level array presets', () => {
    const { configDir, paths } = createPresetTestContext();
    fs.writeFileSync(
      path.join(configDir, 'presets.yaml'),
      ['- name: tppmessages', '  values:', '    athena:', '      database: pn_analytics'].join('\n'),
    );

    const preset = new GOScriptPresetLoader().loadSelectedPreset({
      presetName: 'tppmessages',
      paths,
      schema: createSchema(),
    });

    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
  });

  it('loads JSON presets with an UTF-8 BOM', () => {
    const { configDir, paths } = createPresetTestContext();
    fs.writeFileSync(
      path.join(configDir, 'presets.json'),
      '\uFEFF{"presets":[{"name":"tppmessages","values":{"athena":{"database":"pn_analytics"}}}]}',
    );

    const preset = new GOScriptPresetLoader().loadSelectedPreset({
      presetName: 'tppmessages',
      paths,
      schema: createSchema(),
    });

    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
  });

  it('allows custom preset files only inside config directories', () => {
    const { configDir, root, paths } = createPresetTestContext();
    const nestedConfigDir = path.join(configDir, 'nested');
    fs.mkdirSync(nestedConfigDir, { recursive: true });
    const allowedFile = path.join(nestedConfigDir, 'presets.prod.yaml');
    fs.writeFileSync(allowedFile, ['tppmessages:', '  athena.database: pn_analytics'].join('\n'));

    const preset = new GOScriptPresetLoader().loadSelectedPreset({
      presetName: 'tppmessages',
      presetFile: allowedFile,
      paths,
      schema: createSchema(),
    });

    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
    assert.strictEqual(preset.sourcePath, fs.realpathSync(allowedFile));

    const outsideDir = path.join(root, 'outside');
    fs.mkdirSync(outsideDir, { recursive: true });
    const outsideFile = path.join(outsideDir, 'presets.yaml');
    fs.writeFileSync(outsideFile, ['tppmessages:', '  athena.database: pn_analytics'].join('\n'));
    const outsideRelativeFile = path.relative(process.cwd(), outsideFile);

    assert.throws(
      () =>
        new GOScriptPresetLoader().loadSelectedPreset({
          presetName: 'tppmessages',
          presetFile: outsideFile,
          paths,
          schema: createSchema(),
        }),
      /must be inside an allowed config directory/,
    );
    assert.throws(
      () =>
        new GOScriptPresetLoader().loadSelectedPreset({
          presetName: 'tppmessages',
          presetFile: outsideRelativeFile,
          paths,
          schema: createSchema(),
        }),
      /must be inside an allowed config directory/,
    );
  });

  it('reports unknown keys when allowUnknownKeys is true', () => {
    const { configDir, paths } = createPresetTestContext();
    fs.writeFileSync(path.join(configDir, 'presets.yaml'), ['tppmessages:', '  athena.databse: typo'].join('\n'));

    const preset = new GOScriptPresetLoader().loadSelectedPreset({
      presetName: 'tppmessages',
      paths,
      schema: createSchema(),
    });

    assert.deepStrictEqual(preset.unknownKeys, ['athena.databse']);
  });

  it('throws on unknown keys when allowUnknownKeys is false', () => {
    const { configDir, paths } = createPresetTestContext();
    fs.writeFileSync(
      path.join(configDir, 'presets.yaml'),
      [
        'allowUnknownKeys: false',
        'presets:',
        '  - name: tppmessages',
        '    values:',
        '      athena.databse: typo',
      ].join('\n'),
    );

    assert.throws(
      () =>
        new GOScriptPresetLoader().loadSelectedPreset({
          presetName: 'tppmessages',
          paths,
          schema: createSchema(),
        }),
      /Preset "tppmessages" contains unknown key "athena\.databse". Did you mean "athena\.database"\?/,
    );
  });

  it('throws contextual errors for missing files and missing presets', () => {
    const { configDir, paths } = createPresetTestContext();

    assert.throws(
      () =>
        new GOScriptPresetLoader().loadSelectedPreset({
          presetName: 'missing',
          paths,
          schema: createSchema(),
        }),
      /Preset "missing" requested but presets file was not found/,
    );

    fs.writeFileSync(path.join(configDir, 'presets.yaml'), ['dev:', '  athena.database: pn_dev'].join('\n'));

    assert.throws(
      () =>
        new GOScriptPresetLoader().loadSelectedPreset({
          presetName: 'prod',
          paths,
          schema: createSchema(),
        }),
      /Preset "prod" not found in presets.yaml. Available presets: dev/,
    );
  });

  it('throws for empty, multiple, non-object and malformed presets', () => {
    const { configDir, paths } = createPresetTestContext();
    const loader = new GOScriptPresetLoader();

    assert.throws(
      () => loader.loadSelectedPreset({ presetName: ' ', paths, schema: createSchema() }),
      /script\.preset\.name cannot be empty/,
    );
    assert.throws(
      () => loader.loadSelectedPreset({ presetName: 'base,prod', paths, schema: createSchema() }),
      /Multiple script presets are not supported in v1: base,prod/,
    );

    fs.writeFileSync(path.join(configDir, 'presets.yaml'), 'tppmessages: prod\n');
    assert.throws(
      () => loader.loadSelectedPreset({ presetName: 'tppmessages', paths, schema: createSchema() }),
      /Preset "tppmessages" in presets.yaml must be an object/,
    );

    fs.writeFileSync(path.join(configDir, 'presets.json'), '{bad');
    fs.rmSync(path.join(configDir, 'presets.yaml'));
    assert.throws(
      () => loader.loadSelectedPreset({ presetName: 'tppmessages', paths, schema: createSchema() }),
      /Failed to load presets file/,
    );
  });
});
