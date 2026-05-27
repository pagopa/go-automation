import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOConfigSchema } from '../../GOConfigSchema.js';
import { GOInMemoryConfigProvider } from '../GOInMemoryConfigProvider.js';
import { GOPresetConfigProvider } from '../GOPresetConfigProvider.js';
import { GOSecretsSpecifierFactory } from '../../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../../GOSecretsSpecifier.js';

const PRESET_NAME_PARAMETER = 'script.preset.name';
const PRESET_FILE_PARAMETER = 'script.preset.file';

function createSchema(): GOConfigSchema {
  return {
    getParameter: (name: string) => {
      if (name === PRESET_NAME_PARAMETER) {
        return { name, aliases: ['spn'] };
      }
      if (name === PRESET_FILE_PARAMETER) {
        return { name, aliases: ['spf'] };
      }
      return undefined;
    },
  } as unknown as GOConfigSchema;
}

function createPresetProvider(
  options: {
    readonly selectorValues?: Record<string, string | string[]>;
    readonly warnings?: string[];
    readonly infos?: string[];
    readonly secrets?: GOSecretsSpecifier;
  } = {},
): GOPresetConfigProvider {
  const selectorProvider = new GOInMemoryConfigProvider({
    ...(options.selectorValues !== undefined ? { values: options.selectorValues } : {}),
  });

  return new GOPresetConfigProvider({
    selectorProviders: [selectorProvider],
    presetNameParameter: PRESET_NAME_PARAMETER,
    presetFileParameter: PRESET_FILE_PARAMETER,
    schema: createSchema(),
    loadPreset: (selection) => ({
      name: selection.presetName,
      sourcePath: '/tmp/presets.yaml',
      sourceDisplayPath: selection.presetFile ?? 'presets.yaml',
      values: new Map<string, string | string[]>([
        ['athena.database', `${selection.presetName}_analytics`],
        ['analysis.rules', ['a', 'b']],
        ['slack.token', 'xoxb-secret'],
      ]),
      unknownKeys: [],
      allowUnknownKeys: true,
    }),
    ...(options.secrets !== undefined ? { secretsSpecifier: options.secrets } : {}),
    onWarning: (message) => options.warnings?.push(message),
    onInfo: (message) => options.infos?.push(message),
  });
}

describe('GOPresetConfigProvider', () => {
  it('stays empty when no preset name is configured', () => {
    const provider = createPresetProvider();

    assert.strictEqual(provider.getName(), 'Preset');
    assert.strictEqual(provider.hasKey('athena.database'), false);
    assert.deepStrictEqual(provider.getAllKeys(), []);
  });

  it('loads preset values lazily from selector providers', () => {
    const infos: string[] = [];
    const provider = createPresetProvider({
      selectorValues: {
        [PRESET_NAME_PARAMETER]: 'tppmessages',
      },
      infos,
    });

    assert.strictEqual(provider.hasKey('athena.database'), true);
    assert.strictEqual(provider.getName(), 'Preset(tppmessages)');
    assert.strictEqual(provider.getValue('athena.database'), 'tppmessages_analytics');
    assert.deepStrictEqual(provider.getValue('analysis.rules'), ['a', 'b']);
    assert.deepStrictEqual(provider.getAllKeys().sort(), ['analysis.rules', 'athena.database', 'slack.token']);
    assert.deepStrictEqual(infos, ["Loaded preset 'tppmessages' from presets.yaml (3 keys)"]);
  });

  it('resolves preset selector aliases', () => {
    const provider = createPresetProvider({
      selectorValues: {
        spn: 'prod',
        spf: 'presets.prod.yaml',
      },
    });

    assert.strictEqual(provider.getValue('athena.database'), 'prod_analytics');
    assert.strictEqual(provider.getName(), 'Preset(prod)');
  });

  it('trims preset selector values before loading the preset', () => {
    const selections: { readonly presetName: string; readonly presetFile?: string }[] = [];
    const provider = new GOPresetConfigProvider({
      selectorProviders: [
        new GOInMemoryConfigProvider({
          values: {
            [PRESET_NAME_PARAMETER]: '  prod  ',
            [PRESET_FILE_PARAMETER]: '  presets.prod.yaml  ',
          },
        }),
      ],
      presetNameParameter: PRESET_NAME_PARAMETER,
      presetFileParameter: PRESET_FILE_PARAMETER,
      schema: createSchema(),
      loadPreset: (selection) => {
        selections.push(selection);
        return {
          name: selection.presetName,
          sourcePath: '/tmp/presets.yaml',
          sourceDisplayPath: selection.presetFile ?? 'presets.yaml',
          values: new Map([['athena.database', selection.presetName]]),
          unknownKeys: [],
          allowUnknownKeys: true,
        };
      },
    });

    provider.prepare();

    assert.deepStrictEqual(selections, [{ presetName: 'prod', presetFile: 'presets.prod.yaml' }]);
    assert.strictEqual(provider.getName(), 'Preset(prod)');
    assert.strictEqual(provider.getValue('athena.database'), 'prod');
  });

  it('rejects an empty preset name supplied by a selector provider', () => {
    const provider = new GOPresetConfigProvider({
      selectorProviders: [
        new GOInMemoryConfigProvider({
          values: {
            [PRESET_NAME_PARAMETER]: '',
          },
        }),
      ],
      presetNameParameter: PRESET_NAME_PARAMETER,
      presetFileParameter: PRESET_FILE_PARAMETER,
      schema: createSchema(),
      loadPreset: () => {
        throw new Error('loadPreset should not be called');
      },
    });

    assert.throws(() => provider.prepare(), /script\.preset\.name cannot be empty/);
  });

  it('rejects empty preset selector arrays', () => {
    const presetNameProvider = createPresetProvider({
      selectorValues: {
        [PRESET_NAME_PARAMETER]: [],
      },
    });
    const presetFileProvider = createPresetProvider({
      selectorValues: {
        [PRESET_NAME_PARAMETER]: 'prod',
        [PRESET_FILE_PARAMETER]: [],
      },
    });

    assert.throws(() => presetNameProvider.prepare(), /script\.preset\.name cannot be empty/);
    assert.throws(() => presetFileProvider.prepare(), /script\.preset\.file cannot be empty/);
  });

  it('rejects repeated preset selector values', () => {
    const presetNameProvider = createPresetProvider({
      selectorValues: {
        [PRESET_NAME_PARAMETER]: ['dev', 'prod'],
      },
    });
    const presetFileProvider = createPresetProvider({
      selectorValues: {
        [PRESET_NAME_PARAMETER]: 'prod',
        [PRESET_FILE_PARAMETER]: ['presets.dev.yaml', 'presets.prod.yaml'],
      },
    });

    assert.throws(() => presetNameProvider.prepare(), /script\.preset\.name cannot be specified multiple times/);
    assert.throws(() => presetFileProvider.prepare(), /script\.preset\.file cannot be specified multiple times/);
  });

  it('warns when preset file is configured without preset name', () => {
    const warnings: string[] = [];
    const provider = createPresetProvider({
      selectorValues: {
        [PRESET_FILE_PARAMETER]: 'presets.prod.yaml',
      },
      warnings,
    });

    provider.prepare();

    assert.strictEqual(provider.hasKey('athena.database'), false);
    assert.deepStrictEqual(warnings, [
      `${PRESET_FILE_PARAMETER} is configured but ${PRESET_NAME_PARAMETER} is missing; preset file will be ignored.`,
    ]);
  });

  it('refreshes preset values on prepare', () => {
    const selectorProvider = new GOInMemoryConfigProvider({
      values: {
        [PRESET_NAME_PARAMETER]: 'dev',
      },
    });
    const provider = new GOPresetConfigProvider({
      selectorProviders: [selectorProvider],
      presetNameParameter: PRESET_NAME_PARAMETER,
      presetFileParameter: PRESET_FILE_PARAMETER,
      schema: createSchema(),
      loadPreset: (selection) => ({
        name: selection.presetName,
        sourcePath: '/tmp/presets.yaml',
        sourceDisplayPath: 'presets.yaml',
        values: new Map([['athena.database', selection.presetName]]),
        unknownKeys: [],
        allowUnknownKeys: true,
      }),
    });

    provider.prepare();
    assert.strictEqual(provider.getValue('athena.database'), 'dev');

    selectorProvider.setValue(PRESET_NAME_PARAMETER, 'prod');
    provider.prepare();
    assert.strictEqual(provider.getValue('athena.database'), 'prod');
  });

  it('redacts values using the configured secret specifier', () => {
    const provider = createPresetProvider({
      selectorValues: {
        [PRESET_NAME_PARAMETER]: 'prod',
      },
      secrets: GOSecretsSpecifierFactory.specific(['slack.token']),
    });

    assert.strictEqual(provider.isSecret('slack.token'), true);
    assert.strictEqual(provider.getDisplayValue('slack.token'), '[REDACTED (11 chars)]');
  });
});
