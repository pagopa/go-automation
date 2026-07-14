import type { KnownCase } from '@go-automation/go-runbook';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { anyInteropEvidenceMatches, interopKnownCase, interopKnownCaseAction } from '../interop/interopKnownCases.js';
import { INTEROP_BFF_VAR_PREFIX } from './resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from './runbookSteps.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  cidTrackerStepId: QUERY_INTEROP_CID_TRACKER_STEP_ID,
  varPrefix: INTEROP_BFF_VAR_PREFIX,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'purpose-process-duplicate-event-stream-version',
    description: 'Duplicate key su events_stream_id_version_key gestito tramite retry',
    priority: 100,
    // Le righe degli step vengono confrontate in forma JSON-stringificata, dove le
    // virgolette del messaggio diventano \" — il pattern deve accettarle in entrambe le forme.
    regex: 'duplicate key value violates unique constraint \\\\?"events_stream_id_version_key\\\\?"',
    resolution: 'Nessuna azione operativa immediata: errore noto gestito automaticamente tramite retry.',
  }),
  interopKnownCase(REFS, {
    id: 'bff-invalid-content-disposition-header',
    description: 'Header Content-Disposition non valido nella risposta gestita dal BFF',
    priority: 95,
    regex: 'Invalid character in header content.*Content-Disposition',
    resolution: 'Caso noto BFF. Verificare riferimento PIN-7865 se il volume aumenta.',
  }),
  interopKnownCase(REFS, {
    id: 'bff-adm-zip-invalid-format',
    description: 'Archivio ZIP non valido o troncato ricevuto dal BFF',
    priority: 94,
    regex: 'ADM-ZIP: Invalid or unsupported zip format\\. No END header found',
    resolution: 'Caso noto BFF. Verificare riferimento PIN-9483 se persistente.',
  }),
  interopKnownCase(REFS, {
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
    condition: anyInteropEvidenceMatches(REFS, 'Error getting public key|Token verification failed: JsonWebTokenError'),
    action: interopKnownCaseAction(
      REFS,
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
      conditions: [
        anyInteropEvidenceMatches(REFS, 'errors: 008-9991'),
        anyInteropEvidenceMatches(REFS, 'read ECONNRESET'),
      ],
    },
    action: interopKnownCaseAction(
      REFS,
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
        anyInteropEvidenceMatches(REFS, 'purpose-process'),
        anyInteropEvidenceMatches(REFS, 'read ECONNRESET|socket hang up'),
      ],
    },
    action: interopKnownCaseAction(
      REFS,
      'Errore transitorio verso purpose-process',
      'Verificare riferimento PIN-10449 e la disponibilità del componente purpose-process.',
    ),
  },
  interopKnownCase(REFS, {
    id: 'bff-tenant-kind-not-found',
    description: 'Tenant kind non trovato',
    priority: 60,
    regex: 'errors: 004-0004, Tenant kind .* not found',
    resolution: 'Caso in attesa di feedback prodotto. Raccogliere CID e log correlati dal trace.',
  }),
];
