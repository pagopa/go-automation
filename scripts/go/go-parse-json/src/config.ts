import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';
import { GO_EXPORT_FORMATS, isGOExportFormat } from '@pagopa/go-common/exporters';

export const scriptMetadata: GOScriptMetadata = {
  name: 'GO Parse JSON',
  version: '1.1.0',
  description: 'Filters JSON content - Extract and filter specific data from large JSON files using field paths.',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: GOConfigParameterType.STRING,
    description: 'Percorso del file (JSON/NDJSON) in ingresso',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'field',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Campi da estrarre, separati da virgola (supporta dot-notation o ricerca per chiave)',
    required: true,
    aliases: ['f'],
  },
  {
    name: 'output.file',
    type: GOConfigParameterType.STRING,
    description: 'Percorso del file di output (relativo alla directory output o assoluto)',
    required: false,
    aliases: ['o'],
  },
  {
    name: 'output.format',
    type: GOConfigParameterType.STRING,
    description: `Formato di output: ${GO_EXPORT_FORMATS.join(' | ')} (default: txt)`,
    required: false,
    aliases: ['ff'],
    defaultValue: 'txt',
    validator: (value) =>
      isGOExportFormat(String(value)) ?? `Invalid format "${String(value)}". Valid: ${GO_EXPORT_FORMATS.join(', ')}`,
  },
  {
    name: 'filter',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Filtro predicato semplice (es. status=FAILED)',
    required: false,
    aliases: ['L'],
  },
  {
    name: 'json.path',
    type: GOConfigParameterType.STRING,
    description: 'Path JSON per estrarre un array da una struttura nidificata',
    required: false,
    aliases: ['jp'],
  },
] as const;
