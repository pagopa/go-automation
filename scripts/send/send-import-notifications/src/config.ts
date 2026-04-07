/**
 * SEND Import Notifications - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration interface.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'SEND Import Notifications',
  version: '1.0.0',
  description: 'Importa notifiche SEND da CSV con upload documenti e polling IUN',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'csv.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file CSV di input',
    required: true,
    aliases: ['c'],
  },
  {
    name: 'export.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file CSV di export (con IUN)',
    required: false,
    aliases: ['e'],
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
    name: 'send.notifications',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Invia realmente le notifiche (false = dry-run)',
    required: false,
    defaultValue: false,
    aliases: ['s'],
  },
  {
    name: 'concurrency',
    type: Core.GOConfigParameterType.INT,
    description: 'Numero di notifiche da processare in parallelo',
    required: false,
    defaultValue: 3,
    aliases: ['n'],
  },
  {
    name: 'poll.for.iun',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Effettua polling per ottenere IUN',
    required: false,
    defaultValue: true,
    aliases: ['p'],
  },
  {
    name: 'poll.max.attempts',
    type: Core.GOConfigParameterType.INT,
    description: 'Tentativi massimi di polling per IUN',
    required: false,
    defaultValue: 8,
  },
  {
    name: 'poll.delay.ms',
    type: Core.GOConfigParameterType.INT,
    description: 'Delay in ms tra tentativi di polling',
    required: false,
    defaultValue: 30000,
  },
  {
    name: 'streaming.threshold.mb',
    type: Core.GOConfigParameterType.INT,
    description: 'Soglia MB per attivare streaming mode',
    required: false,
    defaultValue: 10,
  },
  {
    name: 'preserve.all.columns',
    type: Core.GOConfigParameterType.BOOL,
    description: "Preserva tutte le colonne originali del CSV nell'export (CSV passthrough)",
    required: false,
    defaultValue: true,
    aliases: ['preserve-columns'],
  },
  {
    name: 'export.all.rows',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Esporta tutte le righe, incluse quelle fallite (default: solo righe con IUN)',
    required: false,
    defaultValue: false,
  },
  {
    name: 'include.status.columns',
    type: Core.GOConfigParameterType.BOOL,
    description: "Includi colonne di stato (_status, _processedAt, _errorMessage) nell'export",
    required: false,
    defaultValue: false,
  },
  {
    name: 'proxy.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'URL del proxy HTTP per debugging (es. http://127.0.0.1:9090)',
    required: false,
  },
] as const;

