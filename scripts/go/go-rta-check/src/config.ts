/**
 * Go RTA Check - Configuration (metadata + CLI parameters).
 *
 * Dot-separated parameter names map to camelCase config properties
 * (e.g. `watchtower.url` → `watchtowerUrl`, `aws.profiles` → `awsProfiles`).
 */
import { Core } from '@go-automation/go-common';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Go RTA Check',
  version: '1.0.0',
  description:
    'Confronta l’esecuzione dei runbook di go-analyze-alarm con le analisi Watchtower, su tutte le occorrenze di un allarme.',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'watchtower.url',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Watchtower base URL — root del backend (un "/api" finale viene rimosso). Fallback: env GOScript, poi prompt',
    required: false,
    aliases: ['wt'],
  },
  {
    name: 'watchtower.email',
    type: Core.GOConfigParameterType.STRING,
    description: 'Watchtower login email (fallback: env gestita da GOScript, poi prompt)',
    required: false,
  },
  {
    name: 'watchtower.password',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Watchtower login password. Preferire la env WATCHTOWER_PASSWORD o il prompt interattivo; il flag CLI è sconsigliato (resta in shell history / process list). Redatta nei log.',
    required: false,
    sensitive: true,
  },
  {
    name: 'product.id',
    type: Core.GOConfigParameterType.STRING,
    description: 'Watchtower product id (se omesso: selezione interattiva)',
    required: false,
  },
  {
    name: 'environment.id',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Watchtower environment id per filtrare le occorrenze (se omesso: tutti gli ambienti, o selezione interattiva)',
    required: false,
  },
  {
    name: 'alarm.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Nome allarme (= runbook id). Se omesso: selezione interattiva',
    required: false,
    aliases: ['an'],
  },
  {
    name: 'date.from',
    type: Core.GOConfigParameterType.STRING,
    description: 'Inizio periodo su firedAt (ISO 8601). Se omesso: prompt',
    required: false,
    aliases: ['df'],
  },
  {
    name: 'date.to',
    type: Core.GOConfigParameterType.STRING,
    description: 'Fine periodo su firedAt (ISO 8601). Se omesso: prompt',
    required: false,
    aliases: ['dt'],
  },
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Profili AWS SSO per eseguire il runbook (comma-separated). Non richiesti in --dry-run',
    required: false,
    aliases: ['aps'],
  },
  {
    name: 'concurrency',
    type: Core.GOConfigParameterType.INT,
    description: 'Esecuzioni runbook concorrenti (default 1)',
    required: false,
  },
  {
    name: 'limit',
    type: Core.GOConfigParameterType.INT,
    description: 'Numero massimo di occorrenze da processare (per test rapidi)',
    required: false,
  },
  {
    name: 'dry.run',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Recupera i dati Watchtower e mostra la preview, senza eseguire alcun runbook',
    required: false,
  },
  {
    name: 'force',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Ignora la cache di resume e riesegui ogni occorrenza',
    required: false,
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    description: 'Artifact da scrivere: json | md | all (default all)',
    required: false,
  },
  {
    name: 'include.ignorable',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Usa anche le analisi IGNORABLE come oracolo del confronto',
    required: false,
  },
  {
    name: 'include.incomplete',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Usa anche le analisi non COMPLETED come oracolo del confronto',
    required: false,
  },
] as const;
