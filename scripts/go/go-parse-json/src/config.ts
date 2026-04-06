import { Core } from '@go-automation/go-common';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO Parse JSON',
  version: '1.1.0',
  description: 'Estrattore di campi da file JSON/NDJSON/S3/CloudWatch con ricerca ricorsiva e filtri',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file (JSON/NDJSON) o URI (s3://, cwl:/log-group) in ingresso',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'field',
    type: Core.GOConfigParameterType.STRING,
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
    type: Core.GOConfigParameterType.STRING,
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
  {
    name: 'start.time',
    type: Core.GOConfigParameterType.STRING,
    description: 'Data di inizio per CloudWatch Logs (ISO 8601)',
    required: false,
    aliases: ['st'],
  },
  {
    name: 'end.time',
    type: Core.GOConfigParameterType.STRING,
    description: 'Data di fine per CloudWatch Logs (ISO 8601)',
    required: false,
    aliases: ['et'],
  },
  {
    name: 'tail',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Abilita modalità tail per CloudWatch Logs',
    required: false,
    aliases: ['t'],
  },
] as const;
