/**
 * GO Parse JSON - Configuration Module
 *
 * Defines metadata and CLI parameters for the JSON parsing and filtering script.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata.
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO Parse JSON',
  version: '1.1.0',
  description: 'Filters JSON content - Extracts and filters specific data from JSON files using field paths.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions.
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path to the input file (JSON/NDJSON)',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'field',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Fields to extract, comma-separated (supports dot-notation or key search)',
    required: true,
    aliases: ['f'],
  },
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path to the output file (relative to output directory or absolute)',
    aliases: ['o'],
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    description: `Output format: ${Core.GO_EXPORT_FORMATS.join(' | ')} (default: txt)`,
    defaultValue: 'txt',
    aliases: ['ff'],
    validator: (value) =>
      Core.isGOExportFormat(String(value)) ??
      `Invalid format "${String(value)}". Valid: ${Core.GO_EXPORT_FORMATS.join(', ')}`,
  },
  {
    name: 'filter',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Simple predicate filter (e.g., status=FAILED)',
    aliases: ['L'],
  },
  {
    name: 'json.path',
    type: Core.GOConfigParameterType.STRING,
    description: 'JSON path to extract an array from a nested structure',
    aliases: ['jp'],
  },
] as const;
