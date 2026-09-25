/**
 * Send Paper Request Error Check - Configuration Module
 *
 * Definizione dei metadati e dei parametri CLI dello script.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Send Paper Request Error Check',
  version: '1.0.0',
  description:
    'Script unificato e modulare di diagnosi, verifica allegati, restore Glacier/S3 e reportistica per errori Paper Request',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'mode',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Modalità di esecuzione: all (default pipeline completa), check-feedback, get-attachments, retrieve-attachments, retrieve-glacier, validate-pdf, fetch-timelines',
    required: false,
    aliases: ['m'],
    defaultValue: 'all',
    validator: (val: Core.GOConfigParameterValue) =>
      typeof val === 'string' &&
      [
        'all',
        'check-feedback',
        'get-attachments',
        'retrieve-attachments',
        'retrieve-glacier',
        'validate-pdf',
        'fetch-timelines',
      ].includes(val)
        ? true
        : 'Mode deve essere uno tra: all, check-feedback, get-attachments, retrieve-attachments, retrieve-glacier, validate-pdf, fetch-timelines',
  },
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name (es. sso_pn-core-dev, sso_pn-confinfo-prod)',
    required: false,
    aliases: ['ap', 'profile', 'p'],
  },
  {
    name: 'envName',
    type: Core.GOConfigParameterType.STRING,
    description: 'Ambiente di destinazione (dev|uat|test|prod|hotfix)',
    required: false,
    aliases: ['e'],
  },
  {
    name: 'inputFile',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file di input contenente i requestId o gli IUN',
    required: false,
    aliases: ['f', 'input'],
  },
  {
    name: 'bucket',
    type: Core.GOConfigParameterType.STRING,
    description: 'Nome del bucket S3 di destinazione',
    required: false,
    aliases: ['b'],
  },
  {
    name: 'restore',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Abilita la modalità di ripristino per allegati o marker eliminati',
    required: false,
    aliases: ['r'],
    defaultValue: false,
  },
  {
    name: 'outputDir',
    type: Core.GOConfigParameterType.STRING,
    description: 'Directory di output per i file di risultati e report finale',
    required: false,
    aliases: ['o'],
    defaultValue: './results',
  },
  {
    name: 'glacier.expirationDays',
    type: Core.GOConfigParameterType.INT,
    description: 'Numero di giorni per mantenere disponibile il documento ripristinato da Glacier',
    required: false,
    defaultValue: 30,
  },
  {
    name: 'glacier.tier',
    type: Core.GOConfigParameterType.STRING,
    description: 'Livello di velocità per il ripristino da Glacier (Bulk|Standard|Expedited)',
    required: false,
    defaultValue: 'Bulk',
  },
  {
    name: 'pdfValidation.concurrency',
    type: Core.GOConfigParameterType.INT,
    description: 'Numero massimo di richieste S3 concorrenti durante la validazione PDF',
    required: false,
    defaultValue: 100,
  },
  {
    name: 'pdfValidation.batchSize',
    type: Core.GOConfigParameterType.INT,
    description: 'Dimensione del batch per chiavi S3 nella validazione PDF',
    required: false,
    defaultValue: 1000,
  },
  {
    name: 'pdfValidation.dryRun',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Esegue una simulazione della validazione PDF senza fare chiamate reali',
    required: false,
    defaultValue: false,
  },
] as const;

/**
 * Hook eseguito dopo il caricamento della configurazione
 */
export function prepareConfig(_context: Core.GOScriptHookContext): void {
  // Hook per eventuale normalizzazione dinamica delle opzioni
}
