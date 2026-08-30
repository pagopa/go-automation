import type { KnownCase, KnownCaseAnalysis } from '../framework.js';

import { jiraLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { anyInteropEvidenceMatches, interopKnownCase, interopKnownCaseAction } from '../interop/interopKnownCases.js';
import { INTEROP_BFF_VAR_PREFIX } from './resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from './runbookSteps.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  cidTrackerStepId: QUERY_INTEROP_CID_TRACKER_STEP_ID,
  varPrefix: INTEROP_BFF_VAR_PREFIX,
};

/** Resolutions shared between the log action and the analysis draft, so they never drift. */
const PUBLIC_KEY_RESOLUTION =
  'Verificare riferimento PIN-7777 e controllare se il problema è circoscritto a specifiche richieste.';
const AGREEMENT_ECONNRESET_RESOLUTION =
  'Da verificare con riferimento PIN-6400 se il volume o la durata non sono compatibili con un transitorio.';
const PURPOSE_PROCESS_ECONNRESET_RESOLUTION =
  'Verificare riferimento PIN-10449 e la disponibilità del componente purpose-process.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'purpose-process-duplicate-event-stream-version',
    description: 'Duplicate key su events_stream_id_version_key gestito tramite retry',
    priority: 100,
    // Le righe degli step vengono confrontate in forma JSON-stringificata, dove le
    // virgolette del messaggio diventano \" — il pattern deve accettarle in entrambe le forme.
    regex: 'duplicate key value violates unique constraint \\\\?"events_stream_id_version_key\\\\?"',
    resolution: 'Nessuna azione operativa immediata: errore noto gestito automaticamente tramite retry.',
    // Il retry risolve da solo: la conferma può chiudere l'occorrenza.
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
  }),
  interopKnownCase(REFS, {
    id: 'bff-invalid-content-disposition-header',
    description: 'Header Content-Disposition non valido nella risposta gestita dal BFF',
    priority: 95,
    regex: 'Invalid character in header content.*Content-Disposition',
    resolution: 'Caso noto BFF. Verificare riferimento PIN-7865 se il volume aumenta.',
    // La verifica è condizionata a un aumento di volume: sulla singola occorrenza non c'è azione.
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    links: [jiraLink('PIN-7865')],
  }),
  interopKnownCase(REFS, {
    id: 'bff-adm-zip-invalid-format',
    description: 'Archivio ZIP non valido o troncato ricevuto dal BFF',
    priority: 94,
    regex: 'ADM-ZIP: Invalid or unsupported zip format\\. No END header found',
    resolution: 'Caso noto BFF. Verificare riferimento PIN-9483 se persistente.',
    // Verifica condizionata alla persistenza del fenomeno.
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    links: [jiraLink('PIN-9483')],
  }),
  interopKnownCase(REFS, {
    id: 'bff-token-expired',
    description: 'Token JWT scaduto',
    priority: 93,
    regex: 'Token verification failed: TokenExpiredError: jwt expired',
    resolution: 'Token scaduto. Normalmente non richiede azione operativa.',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
  }),
  {
    id: 'bff-error-getting-public-key',
    description: 'Errore nel recupero o nella validazione della public key',
    priority: 90,
    condition: anyInteropEvidenceMatches(REFS, 'Error getting public key|Token verification failed: JsonWebTokenError'),
    action: interopKnownCaseAction(
      REFS,
      'Errore nel recupero o nella validazione della public key',
      PUBLIC_KEY_RESOLUTION,
    ),
    // Verifica non condizionata: l'occorrenza resta aperta finché un operatore non guarda.
    analysis: analyzable(PUBLIC_KEY_RESOLUTION, 'IN_PROGRESS', 'PIN-7777'),
  },
  {
    id: 'bff-agreement-api-econnreset',
    description: 'ECONNRESET nella chiamata agreement API dal BFF',
    priority: 80,
    condition: all(
      anyInteropEvidenceMatches(REFS, 'errors: 008-9991'),
      anyInteropEvidenceMatches(REFS, 'read ECONNRESET'),
    ),
    action: interopKnownCaseAction(
      REFS,
      'ECONNRESET nella chiamata agreement API dal BFF',
      AGREEMENT_ECONNRESET_RESOLUTION,
    ),
    // Verifica condizionata a volume/durata anomali: il transitorio in sé non richiede azione.
    analysis: analyzable(AGREEMENT_ECONNRESET_RESOLUTION, 'COMPLETED', 'PIN-6400'),
  },
  {
    id: 'purpose-process-unavailable-econnreset',
    description: 'Errore transitorio verso purpose-process',
    priority: 70,
    condition: all(
      anyInteropEvidenceMatches(REFS, 'purpose-process'),
      anyInteropEvidenceMatches(REFS, 'read ECONNRESET|socket hang up'),
    ),
    action: interopKnownCaseAction(
      REFS,
      'Errore transitorio verso purpose-process',
      PURPOSE_PROCESS_ECONNRESET_RESOLUTION,
    ),
    // Chiede di verificare la disponibilità del componente: serve l'occhio dell'operatore.
    analysis: analyzable(PURPOSE_PROCESS_ECONNRESET_RESOLUTION, 'IN_PROGRESS', 'PIN-10449'),
  },
  interopKnownCase(REFS, {
    id: 'bff-tenant-kind-not-found',
    description: 'Tenant kind non trovato',
    priority: 60,
    regex: 'errors: 004-0004, Tenant kind .* not found',
    resolution: 'Caso in attesa di feedback prodotto. Raccogliere CID e log correlati dal trace.',
    // In attesa di feedback prodotto: l'analisi resta aperta.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
  }),
];

/** Analysis directives of the cases built inline, which cannot go through `interopKnownCase`. */
function analyzable(
  resolution: string,
  proposedStatus: 'IN_PROGRESS' | 'COMPLETED',
  jiraKey: string,
): KnownCaseAnalysis {
  return {
    resolution,
    proposedStatus,
    analysisType: 'ANALYZABLE',
    links: [jiraLink(jiraKey)],
  };
}
