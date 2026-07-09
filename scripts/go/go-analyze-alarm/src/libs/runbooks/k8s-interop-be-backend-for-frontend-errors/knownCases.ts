import type { CaseAction, Condition, KnownCase } from '@go-automation/go-runbook';

import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from './runbookSteps.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase({
    id: 'purpose-process-duplicate-event-stream-version',
    description: 'Duplicate key su events_stream_id_version_key gestito tramite retry',
    priority: 100,
    // Le righe degli step vengono confrontate in forma JSON-stringificata, dove le
    // virgolette del messaggio diventano \" — il pattern deve accettarle in entrambe le forme.
    regex: 'duplicate key value violates unique constraint \\\\?"events_stream_id_version_key\\\\?"',
    resolution: 'Nessuna azione operativa immediata: errore noto gestito automaticamente tramite retry.',
  }),
  interopKnownCase({
    id: 'bff-invalid-content-disposition-header',
    description: 'Header Content-Disposition non valido nella risposta gestita dal BFF',
    priority: 95,
    regex: 'Invalid character in header content.*Content-Disposition',
    resolution: 'Caso noto BFF. Verificare riferimento PIN-7865 se il volume aumenta.',
  }),
  interopKnownCase({
    id: 'bff-adm-zip-invalid-format',
    description: 'Archivio ZIP non valido o troncato ricevuto dal BFF',
    priority: 94,
    regex: 'ADM-ZIP: Invalid or unsupported zip format\\. No END header found',
    resolution: 'Caso noto BFF. Verificare riferimento PIN-9483 se persistente.',
  }),
  interopKnownCase({
    id: 'bff-token-expired',
    description: 'Token JWT scaduto',
    priority: 93,
    regex: 'Token verification failed: TokenExpiredError: jwt expired',
    resolution: 'Token scaduto. Normalmente non richiede azione operativa.',
  }),
  {
    id: 'bff-error-getting-public-key',
    description: 'Errore nel recupero o nella validazione della public key',
    priority: 90,
    condition: anyInteropEvidenceMatches('Error getting public key|Token verification failed: JsonWebTokenError'),
    action: knownCaseAction(
      'Errore nel recupero o nella validazione della public key',
      'Verificare riferimento PIN-7777 e controllare se il problema è circoscritto a specifiche richieste.',
    ),
  },
  {
    id: 'bff-agreement-api-econnreset',
    description: 'ECONNRESET nella chiamata agreement API dal BFF',
    priority: 80,
    condition: {
      type: 'and',
      conditions: [anyInteropEvidenceMatches('errors: 008-9991'), anyInteropEvidenceMatches('read ECONNRESET')],
    },
    action: knownCaseAction(
      'ECONNRESET nella chiamata agreement API dal BFF',
      'Da verificare con riferimento PIN-6400 se il volume o la durata non sono compatibili con un transitorio.',
    ),
  },
  {
    id: 'purpose-process-unavailable-econnreset',
    description: 'Errore transitorio verso purpose-process',
    priority: 70,
    condition: {
      type: 'and',
      conditions: [
        anyInteropEvidenceMatches('purpose-process'),
        anyInteropEvidenceMatches('read ECONNRESET|socket hang up'),
      ],
    },
    action: knownCaseAction(
      'Errore transitorio verso purpose-process',
      'Verificare riferimento PIN-10449 e la disponibilità del componente purpose-process.',
    ),
  },
  interopKnownCase({
    id: 'bff-tenant-kind-not-found',
    description: 'Tenant kind non trovato',
    priority: 60,
    regex: 'errors: 004-0004, Tenant kind .* not found',
    resolution: 'Caso in attesa di feedback prodotto. Raccogliere CID e log correlati dal trace.',
  }),
];

interface InteropKnownCaseConfig {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly regex: string;
  readonly resolution: string;
}

function interopKnownCase(config: InteropKnownCaseConfig): KnownCase {
  return {
    id: config.id,
    description: config.description,
    priority: config.priority,
    condition: anyInteropEvidenceMatches(config.regex),
    action: knownCaseAction(config.description, config.resolution),
  };
}

function anyInteropEvidenceMatches(regex: string): Condition {
  return {
    type: 'or',
    conditions: [
      { type: 'contains', ref: `steps.${QUERY_INTEROP_APPLICATION_LOGS_STEP_ID}`, regex },
      { type: 'contains', ref: `steps.${QUERY_INTEROP_CID_TRACKER_STEP_ID}`, regex },
    ],
  };
}

function knownCaseAction(title: string, resolution: string): CaseAction {
  return {
    type: 'log',
    level: 'info',
    renderAs: 'known-case',
    message:
      `[CASO NOTO] ${title}\n` +
      `Risoluzione: ${resolution}\n` +
      'Ambiente: {{vars.interopEnvironment}}\n' +
      'Log group: {{vars.interopLogGroup}}\n' +
      'Servizio: {{vars.interopPodApp}}\n' +
      'CID analizzati: {{vars.interopBffCidCount}}\n',
  };
}
