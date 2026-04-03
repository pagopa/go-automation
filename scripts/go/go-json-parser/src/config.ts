import { Core } from '@go-automation/go-common';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO JSON Parser',
  version: '1.0.0',
  description: 'Estrattore di campi da file JSON/NDJSON con ricerca ricorsiva',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file JSON o NDJSON in ingresso',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'field',
    type: Core.GOConfigParameterType.STRING,
    description: 'Campo da estrarre (supporta dot-notation o ricerca per chiave)',
    required: true,
    aliases: ['f'],
  },
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file di output (TXT)',
    required: false,
    aliases: ['o'],
  },
] as const;
