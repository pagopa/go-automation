import type { GOConfigParameterOptions } from '../config/GOConfigParameter.js';
import { GOConfigParameterType } from '../config/GOConfigParameterType.js';

export const GOSCRIPT_PRESET_NAME_PARAMETER = 'script.preset.name';
export const GOSCRIPT_PRESET_FILE_PARAMETER = 'script.preset.file';

export function getGOScriptSystemParameters(): ReadonlyArray<GOConfigParameterOptions> {
  return [
    {
      name: GOSCRIPT_PRESET_NAME_PARAMETER,
      displayName: 'Script Preset Name',
      type: GOConfigParameterType.STRING,
      group: 'GOScript',
      cliFlag: '--script-preset-name',
      aliases: ['spn'],
      envVar: 'SCRIPT_PRESET_NAME',
      abstract: 'Load values from a named script preset',
      description:
        'Selects a preset from presets.yaml, presets.yml, presets.json, or the file configured with script.preset.file. Preset values are lower priority than CLI, config files, environment, and Lambda event values.',
      required: false,
      reserved: true,
    },
    {
      name: GOSCRIPT_PRESET_FILE_PARAMETER,
      displayName: 'Script Preset File',
      type: GOConfigParameterType.STRING,
      group: 'GOScript',
      cliFlag: '--script-preset-file',
      aliases: ['spf'],
      envVar: 'SCRIPT_PRESET_FILE',
      abstract: 'Use a custom script presets file',
      description:
        'Overrides the default presets.yaml, presets.yml, presets.json lookup. Relative file names are resolved through the script config paths; relative paths with directories are resolved from the current working directory, but the resolved file must be within an allowed config directory such as the data config directory or local configs/.',
      required: false,
      reserved: true,
    },
  ];
}
