/**
 * SEND Dispatch Notifications - Configuration Module
 *
 * Script metadata and parameters (§13 of EVO-SENDNOTIF-OPUS-01).
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'SEND Dispatch Notifications',
  version: '1.0.0',
  description: 'Invio di notifiche SEND via API B2B con throttling, verifica, journal e ripresa',
  authors: ['Team GO - Gestione Operativa'],
};

const { STRING, INT, DOUBLE, BOOL, STRING_ARRAY } = Core.GOConfigParameterType;

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  // Mode and input
  { name: 'mode', type: STRING, description: 'Modalità di invio: e2e (direct: fase 3)', defaultValue: 'e2e' },
  { name: 'input.file', type: STRING, description: 'File di input (CSV, JSON, JSONL)', aliases: ['i'] },
  { name: 'input.format', type: STRING, description: 'Formato dell input: csv, json, jsonl (default: da estensione)' },
  {
    name: 'mapping.profile',
    type: STRING,
    description: 'Profilo di mapping: standard, qa-test o path di un JSON',
    defaultValue: 'standard',
  },
  { name: 'row.key.column', type: STRING, description: 'Colonna con la chiave stabile della riga' },

  // Environments
  { name: 'env', type: STRING, description: 'Nome dell ambiente nel file di ambienti', aliases: ['e'] },
  {
    name: 'environments.file',
    type: STRING,
    description: 'File di ambienti YAML/JSON (default: configs/environments.yaml)',
  },
  { name: 'list.envs', type: BOOL, description: 'Elenca gli ambienti (senza API key) ed esce', defaultValue: false },
  { name: 'base.path', type: STRING, description: 'Override dell host dell API B2B' },
  { name: 'pn.api.key', type: STRING, description: 'Override dell API key', sensitive: true },
  { name: 'group.id', type: STRING, description: 'Override del groupId (ente a nome del quale si invia)' },
  { name: 'sender.tax.id', type: STRING, description: 'Codice fiscale del mittente (run senza --env)' },
  { name: 'sender.denomination', type: STRING, description: 'Denominazione del mittente (run senza --env)' },
  {
    name: 'api.version',
    type: STRING,
    description: 'Versione dell endpoint requests: v2.4, v2.5, v2.6',
    defaultValue: 'v2.6',
  },

  // Documents
  { name: 'document.file', type: STRING_ARRAY, description: 'Documento/i condiviso/i da caricare una volta per run' },
  { name: 'document.title', type: STRING, description: 'Titolo del documento condiviso' },
  { name: 'documents.dir', type: STRING, description: 'Base dei path relativi dei documenti per riga' },
  { name: 'attachments.file', type: STRING, description: 'files-results.json di send-upload-attachments (pratica)' },
  { name: 'upload.concurrency', type: INT, description: 'PUT su SafeStorage in parallelo', defaultValue: 5 },
  { name: 'preload.batch.size', type: INT, description: 'File per chiamata di preload (1-15)', defaultValue: 15 },
  {
    name: 'upload.reuse.max.age',
    type: STRING,
    description: 'Età massima di un upload riusabile al resume',
    defaultValue: '72h',
  },

  // Phases and safety
  {
    name: 'phases',
    type: STRING_ARRAY,
    description: 'Fasi: send, verify (request-id: fase 2)',
    defaultValue: ['send', 'verify'],
  },
  { name: 'dry.run', type: BOOL, description: 'Nessuna chiamata (default sicuro)', defaultValue: true },
  { name: 'yes', type: BOOL, description: 'Salta la conferma (non in produzione)', defaultValue: false },
  { name: 'confirm.production', type: INT, description: 'In produzione: numero di righe valide da confermare' },
  { name: 'fail.fast', type: BOOL, description: 'Si ferma alla prima riga non valida o fallita', defaultValue: false },

  // Resume and retries
  { name: 'resume', type: STRING, description: 'runId o path della directory del run da riprendere' },
  {
    name: 'retry.failed',
    type: BOOL,
    description: 'Con resume, reinvia le SEND_FAILED ripetibili',
    defaultValue: false,
  },
  { name: 'retry.uncertain', type: BOOL, description: 'Con resume, riconcilia le SEND_UNCERTAIN', defaultValue: false },
  {
    name: 'send.retry.ambiguous',
    type: BOOL,
    description: 'Riconcilia gli esiti ambigui con la lookup per protocollo',
    defaultValue: true,
  },
  {
    name: 'send.timeout',
    type: STRING,
    description: 'Tempo massimo per riga in rischedulazione da 429',
    defaultValue: '10m',
  },

  // Throughput
  { name: 'rate', type: DOUBLE, description: 'Chiamate B2B al secondo', defaultValue: 20 },
  { name: 'burst', type: INT, description: 'Capienza del bucket', defaultValue: 1 },
  { name: 'rate.adaptive', type: BOOL, description: 'Riduce il rate ai 429', defaultValue: true },
  { name: 'max.in.flight', type: INT, description: 'Richieste HTTP contemporanee', defaultValue: 40 },
  { name: 'http.timeout', type: STRING, description: 'Timeout di una richiesta HTTP', defaultValue: '60s' },
  { name: 'proxy.url', type: STRING, description: 'Proxy HTTP di debug' },

  // Verify
  { name: 'verify.initial.delay', type: STRING, description: 'Primo controllo di stato', defaultValue: '10s' },
  { name: 'verify.timeout', type: STRING, description: 'Timeout della verifica per riga', defaultValue: '15m' },

  // Output
  { name: 'output.format', type: STRING, description: 'Formato dell output: csv, json, jsonl (default: come input)' },
  { name: 'output.file', type: STRING, description: 'Path esplicito del file principale' },
  {
    name: 'output.include.status',
    type: BOOL,
    description: 'Colonne di stato nel file principale',
    defaultValue: false,
  },
  {
    name: 'output.only.success',
    type: BOOL,
    description: 'Solo righe con IUN nel file principale',
    defaultValue: false,
  },
];
