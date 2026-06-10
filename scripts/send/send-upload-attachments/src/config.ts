/**
 * Send Upload Attachments - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Send Upload Attachments',
  version: '1.0.0',
  description: 'Carica gli allegati su SafeStorage',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file di input (csv, json o jsonl) con i file da caricare',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file di output (default: <input>-results.<formato>)',
    required: false,
    aliases: ['o'],
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    description:
      "Formato del file di output: csv, json o jsonl (default: dall'estensione del file di output o di input)",
    required: false,
  },
  {
    name: 'base.path',
    type: Core.GOConfigParameterType.STRING,
    description: 'Base URL del servizio PN',
    required: true,
    aliases: ['b'],
  },
  {
    name: 'pn.api.key',
    type: Core.GOConfigParameterType.STRING,
    description: 'API Key per autenticazione PN',
    required: true,
    sensitive: true,
    aliases: ['k'],
  },
  {
    name: 'skip.on.error',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Prosegue con i file successivi in caso di errore (false = si ferma al primo errore)',
    required: false,
    defaultValue: false,
    aliases: ['s'],
  },
  {
    name: 'concurrency',
    type: Core.GOConfigParameterType.INT,
    description: 'Numero di file da caricare in parallelo',
    required: false,
    defaultValue: 3,
    aliases: ['n'],
  },
  {
    name: 'default.content.type',
    type: Core.GOConfigParameterType.STRING,
    description: "Content type usato quando non specificato nella riga e non inferibile dall'estensione",
    required: false,
  },
  {
    name: 'proxy.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'URL del proxy HTTP per debugging (es. http://127.0.0.1:9090)',
    required: false,
  },
  {
    name: 'debug',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Abilita il logging di debug delle chiamate HTTP',
    required: false,
    defaultValue: false,
  },
] as const;
