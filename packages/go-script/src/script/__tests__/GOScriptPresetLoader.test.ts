import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import type { GOConfigSchema } from '../../config/GOConfigSchema.js';
import { GOPathEnvironmentVariables } from '../../paths/GOPathEnvironmentVariables.js';
import { GOPaths } from '../../paths/GOPaths.js';
import { GOPresetUnknownKeysError } from '../GOPresetUnknownKeysError.js';
import { GOScriptPresetLoader } from '../GOScriptPresetLoader.js';
import type { GOScriptPresetResolution } from '../GOScriptPresetLoader.js';

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

interface LoadOptions {
  readonly presetName?: string;
  readonly presetFile?: string;
  readonly loader?: GOScriptPresetLoader;
}

/** Loads the selected preset (`tppmessages` unless told otherwise) against the test schema. */
function load(paths: GOPaths, options: LoadOptions = {}): GOScriptPresetResolution {
  return (options.loader ?? new GOScriptPresetLoader()).loadSelectedPreset({
    presetName: options.presetName ?? 'tppmessages',
    ...(options.presetFile !== undefined ? { presetFile: options.presetFile } : {}),
    paths,
    schema: createSchema(),
  });
}

/** Writes `lines` as the presets file `fileName` of `configDir`, returning its path. */
function writePresets(configDir: string, fileName: string, lines: ReadonlyArray<string>): string {
  const filePath = path.join(configDir, fileName);
  fs.writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

const MAP_PRESET = ['tppmessages:', '  athena.database: pn_analytics'];

const UNKNOWN_KEY_PRESETS = [
  'allowUnknownKeys: false',
  'presets:',
  '  - name: tppmessages',
  '    values:',
  '      athena.databse: typo',
];

describe('GOScriptPresetLoader', () => {
  it('loads wrapper presets from the default presets.yaml file', () => {
    const { configDir, paths } = createPresetTestContext();
    const presetsPath = writePresets(configDir, 'presets.yaml', [
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
    ]);

    const preset = load(paths);

    assert.strictEqual(preset.name, 'tppmessages');
    assert.strictEqual(preset.sourceDisplayPath, 'presets.yaml');
    assert.strictEqual(preset.sourcePath, fs.realpathSync(presetsPath));
    assert.strictEqual(preset.allowUnknownKeys, true);
    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
    assert.strictEqual(preset.values.get('athena.workgroup'), 'primary');
    assert.deepStrictEqual(preset.values.get('analysis.rules'), ['rule-a', 'rule-b']);
    assert.deepStrictEqual(preset.unknownKeys, []);
  });

  it('loads top-level map, top-level array and BOM-prefixed JSON presets', () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>, string | undefined]> = [
      ['presets.prod.yaml', [...MAP_PRESET, '  output:', '    format: csv'], 'presets.prod.yaml'],
      ['presets.yaml', ['- name: tppmessages', '  values:', '    athena:', '      database: pn_analytics'], undefined],
      [
        'presets.json',
        ['\uFEFF{"presets":[{"name":"tppmessages","values":{"athena":{"database":"pn_analytics"}}}]}'],
        undefined,
      ],
    ];

    for (const [fileName, lines, presetFile] of cases) {
      const { configDir, paths } = createPresetTestContext();
      writePresets(configDir, fileName, lines);

      const preset = load(paths, presetFile !== undefined ? { presetFile } : {});

      assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics', fileName);
      assert.strictEqual(preset.sourceDisplayPath, fileName);
    }
  });

  it('flattens nested values of a top-level map preset, allowing unknown keys by default', () => {
    const { configDir, paths } = createPresetTestContext();
    writePresets(configDir, 'presets.yaml', [...MAP_PRESET, '  output:', '    format: csv', '  athena.databse: typo']);

    const preset = load(paths);

    assert.strictEqual(preset.values.get('output.format'), 'csv');
    assert.strictEqual(preset.allowUnknownKeys, true);
    assert.deepStrictEqual(preset.unknownKeys, ['athena.databse']);
  });

  it('rejects duplicate normalized preset names in top-level map files', () => {
    const { configDir, paths } = createPresetTestContext();
    writePresets(configDir, 'presets.yaml', [
      '" tppmessages ":',
      '  athena.database: first',
      'tppmessages:',
      '  athena.database: second',
    ]);

    assert.throws(() => load(paths), /Duplicate preset name "tppmessages" in presets\.yaml/);
  });

  it('uses an injected filesystem when reading presets', () => {
    const { configDir, root, paths } = createPresetTestContext();
    const presetFile = path.join(configDir, 'virtual.yaml');
    const readPaths: string[] = [];
    const loader = new GOScriptPresetLoader({
      fileSystem: {
        existsSync: (filePath) => filePath.startsWith(root),
        realpathSync: (filePath) => filePath,
        readFileSync: (filePath) => {
          readPaths.push(filePath);
          return MAP_PRESET.join('\n');
        },
      },
    });

    const preset = load(paths, { presetFile, loader });

    assert.deepStrictEqual(readPaths, [presetFile]);
    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
  });

  it('allows custom preset files only inside config directories', () => {
    const { configDir, root, paths } = createPresetTestContext();
    fs.mkdirSync(path.join(configDir, 'nested'), { recursive: true });
    const allowedFile = writePresets(configDir, path.join('nested', 'presets.prod.yaml'), MAP_PRESET);

    const preset = load(paths, { presetFile: allowedFile });

    assert.strictEqual(preset.values.get('athena.database'), 'pn_analytics');
    assert.strictEqual(preset.sourcePath, fs.realpathSync(allowedFile));

    const outsideDir = path.join(root, 'outside');
    fs.mkdirSync(outsideDir, { recursive: true });
    const outsideFile = writePresets(outsideDir, 'presets.yaml', MAP_PRESET);

    for (const presetFile of [outsideFile, path.relative(process.cwd(), outsideFile)]) {
      assert.throws(() => load(paths, { presetFile }), /must be inside an allowed config directory/);
    }
  });

  it('throws a structured, suggesting error on unknown keys when allowUnknownKeys is false', () => {
    const { configDir, paths } = createPresetTestContext();
    writePresets(configDir, 'presets.yaml', UNKNOWN_KEY_PRESETS);

    assert.throws(
      () => load(paths),
      (error: unknown) => {
        assert.ok(error instanceof GOPresetUnknownKeysError);
        assert.match(
          error.message,
          /Preset "tppmessages" contains unknown key "athena\.databse". Did you mean "athena\.database"\?/,
        );
        assert.strictEqual(error.presetName, 'tppmessages');
        assert.deepStrictEqual(error.unknownKeys, ['athena.databse']);
        assert.deepStrictEqual([...error.knownKeys].sort(), [
          'analysis.rules',
          'athena.database',
          'athena.workgroup',
          'output.format',
        ]);
        assert.deepStrictEqual({ ...error.suggestions }, { 'athena.databse': 'athena.database' });
        return true;
      },
    );
  });

  it('throws contextual errors for missing files and missing presets', () => {
    const { configDir, paths } = createPresetTestContext();

    assert.throws(
      () => load(paths, { presetName: 'missing' }),
      /Preset "missing" requested but presets file was not found/,
    );

    writePresets(configDir, 'presets.yaml', ['dev:', '  athena.database: pn_dev']);

    assert.throws(
      () => load(paths, { presetName: 'prod' }),
      /Preset "prod" not found in presets.yaml. Available presets: dev/,
    );
  });

  it('includes the presets file path in per-preset metadata validation errors', () => {
    const { configDir, paths } = createPresetTestContext();
    const cases: ReadonlyArray<readonly [ReadonlyArray<string>, RegExp]> = [
      [['    allowUnknownKeys: maybe'], /Invalid presets\.yaml\.presets\[0\]\.allowUnknownKeys\. Expected a boolean\./],
      [
        ['    description:', '      text: invalid'],
        /Invalid presets\.yaml\.presets\[0\]\.description\. Expected a string\./,
      ],
    ];

    for (const [metadata, message] of cases) {
      writePresets(configDir, 'presets.yaml', [
        'presets:',
        '  - name: tppmessages',
        ...metadata,
        '    values:',
        '      athena.database: pn_analytics',
      ]);

      assert.throws(() => load(paths), message);
    }
  });

  it('throws for empty, multiple, non-object and malformed presets', () => {
    const { configDir, paths } = createPresetTestContext();

    assert.throws(() => load(paths, { presetName: ' ' }), /script\.preset\.name cannot be empty/);
    assert.throws(
      () => load(paths, { presetName: 'base,prod' }),
      /Multiple script presets are not supported in v1: base,prod/,
    );

    writePresets(configDir, 'presets.yaml', ['tppmessages: prod']);
    assert.throws(() => load(paths), /Preset "tppmessages" in presets.yaml must be an object/);

    writePresets(configDir, 'presets.json', ['{bad']);
    fs.rmSync(path.join(configDir, 'presets.yaml'));
    assert.throws(() => load(paths), /Failed to load presets file/);
  });
});
