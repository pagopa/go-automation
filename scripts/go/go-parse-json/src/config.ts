import { Core } from '@go-automation/go-common';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO Parse JSON',
  version: '1.1.0',
  description: 'Filters JSON content - Extract and filter specific data from large JSON files using field paths.',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file (JSON/NDJSON) in ingresso',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'field',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Campi da estrarre, separati da virgola (supporta dot-notation o ricerca per chiave)',
    required: true,
    aliases: ['f'],
  },
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file di output (relativo alla directory output o assoluto)',
    required: false,
    aliases: ['o'],
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    description: `Formato di output: ${Core.GO_EXPORT_FORMATS.join(' | ')} (default: txt)`,
    required: false,
    aliases: ['ff'],
    defaultValue: 'txt',
    validator: (value) =>
      Core.isGOExportFormat(String(value)) ??
      `Invalid format "${String(value)}". Valid: ${Core.GO_EXPORT_FORMATS.join(', ')}`,
  },
  {
    name: 'filter',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Filtro predicato semplice (es. status=FAILED)',
    required: false,
    aliases: ['L'],
  },
  {
    name: 'json.path',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path JSON per estrarre un array da una struttura nidificata',
    required: false,
    aliases: ['jp'],
  },
] as const;
