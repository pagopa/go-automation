import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOConfigSchema } from '../../GOConfigSchema.js';
import { GOInMemoryConfigProvider } from '../GOInMemoryConfigProvider.js';
import { GOPresetConfigProvider } from '../GOPresetConfigProvider.js';
import type { GOPresetConfigProviderSelection } from '../GOPresetConfigProvider.js';
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

interface PresetProviderOptions {
  readonly selectorValues?: Record<string, string | string[]>;
  readonly warnings?: string[];
  readonly infos?: string[];
  readonly secrets?: GOSecretsSpecifier;
}

interface PresetProviderHarness {
  readonly provider: GOPresetConfigProvider;
  readonly selectorProvider: GOInMemoryConfigProvider;
  /** Every selection handed to the preset loader, in order. */
  readonly selections: ReadonlyArray<GOPresetConfigProviderSelection>;
}

/** Builds a preset provider whose loader derives the values from the selected name. */
function createHarness(options: PresetProviderOptions = {}): PresetProviderHarness {
  const selections: GOPresetConfigProviderSelection[] = [];
  const selectorProvider = new GOInMemoryConfigProvider({
    ...(options.selectorValues !== undefined ? { values: options.selectorValues } : {}),
  });

  const provider = new GOPresetConfigProvider({
    selectorProviders: [selectorProvider],
    presetNameParameter: PRESET_NAME_PARAMETER,
    presetFileParameter: PRESET_FILE_PARAMETER,
    schema: createSchema(),
    loadPreset: (selection) => {
      selections.push(selection);
      return {
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
      };
    },
    ...(options.secrets !== undefined ? { secretsSpecifier: options.secrets } : {}),
    onWarning: (message) => options.warnings?.push(message),
    onInfo: (message) => options.infos?.push(message),
  });

  return { provider, selectorProvider, selections };
}

describe('GOPresetConfigProvider', () => {
  it('stays empty when no preset name is configured', () => {
    const { provider, selections } = createHarness();

    assert.strictEqual(provider.getName(), 'Preset');
    assert.strictEqual(provider.hasKey('athena.database'), false);
    assert.deepStrictEqual(provider.getAllKeys(), []);
    assert.deepStrictEqual(selections, []);
  });

  it('loads preset values lazily from selector providers', () => {
    const infos: string[] = [];
    const { provider } = createHarness({ selectorValues: { [PRESET_NAME_PARAMETER]: 'tppmessages' }, infos });

    assert.strictEqual(provider.hasKey('athena.database'), true);
    assert.strictEqual(provider.getName(), 'Preset(tppmessages)');
    assert.strictEqual(provider.getValue('athena.database'), 'tppmessages_analytics');
    assert.deepStrictEqual(provider.getValue('analysis.rules'), ['a', 'b']);
    assert.deepStrictEqual(provider.getAllKeys().sort(), ['analysis.rules', 'athena.database', 'slack.token']);
    assert.deepStrictEqual(infos, ["Loaded preset 'tppmessages' from presets.yaml (3 keys)"]);
  });

  it('resolves preset selector aliases and trims the selected values', () => {
    const cases: ReadonlyArray<Record<string, string>> = [
      { spn: 'prod', spf: 'presets.prod.yaml' },
      { [PRESET_NAME_PARAMETER]: '  prod  ', [PRESET_FILE_PARAMETER]: '  presets.prod.yaml  ' },
    ];

    for (const selectorValues of cases) {
      const { provider, selections } = createHarness({ selectorValues });

      provider.prepare();

      assert.deepStrictEqual(selections, [{ presetName: 'prod', presetFile: 'presets.prod.yaml' }]);
      assert.strictEqual(provider.getName(), 'Preset(prod)');
      assert.strictEqual(provider.getValue('athena.database'), 'prod_analytics');
    }
  });

  it('rejects empty or repeated preset selectors without loading a preset', () => {
    const cases: ReadonlyArray<readonly [Record<string, string | string[]>, RegExp]> = [
      [{ [PRESET_NAME_PARAMETER]: '' }, /script\.preset\.name cannot be empty/],
      [{ [PRESET_NAME_PARAMETER]: [] }, /script\.preset\.name cannot be empty/],
      [{ [PRESET_NAME_PARAMETER]: 'prod', [PRESET_FILE_PARAMETER]: [] }, /script\.preset\.file cannot be empty/],
      [{ [PRESET_NAME_PARAMETER]: ['dev', 'prod'] }, /script\.preset\.name cannot be specified multiple times/],
      [
        { [PRESET_NAME_PARAMETER]: 'prod', [PRESET_FILE_PARAMETER]: ['presets.dev.yaml', 'presets.prod.yaml'] },
        /script\.preset\.file cannot be specified multiple times/,
      ],
    ];

    for (const [selectorValues, message] of cases) {
      const { provider, selections } = createHarness({ selectorValues });

      assert.throws(() => provider.prepare(), message);
      assert.deepStrictEqual(selections, []);
    }
  });

  it('ignores a preset file without a preset name, warning only when the file is set', () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
      [
        'presets.prod.yaml',
        [
          `${PRESET_FILE_PARAMETER} is configured but ${PRESET_NAME_PARAMETER} is missing; preset file will be ignored.`,
        ],
      ],
      ['   ', []],
    ];

    for (const [presetFile, expectedWarnings] of cases) {
      const warnings: string[] = [];
      const { provider } = createHarness({ selectorValues: { [PRESET_FILE_PARAMETER]: presetFile }, warnings });

      provider.prepare();

      assert.strictEqual(provider.hasKey('athena.database'), false);
      assert.deepStrictEqual(warnings, expectedWarnings);
    }
  });

  it('refreshes preset values on prepare', () => {
    const { provider, selectorProvider } = createHarness({ selectorValues: { [PRESET_NAME_PARAMETER]: 'dev' } });

    provider.prepare();
    assert.strictEqual(provider.getValue('athena.database'), 'dev_analytics');

    selectorProvider.setValue(PRESET_NAME_PARAMETER, 'prod');
    provider.prepare();
    assert.strictEqual(provider.getValue('athena.database'), 'prod_analytics');
  });

  it('redacts values using the configured secret specifier', () => {
    const { provider } = createHarness({
      selectorValues: { [PRESET_NAME_PARAMETER]: 'prod' },
      secrets: GOSecretsSpecifierFactory.specific(['slack.token']),
    });

    assert.strictEqual(provider.isSecret('slack.token'), true);
    assert.strictEqual(provider.getDisplayValue('slack.token'), '[REDACTED (11 chars)]');
  });
});
