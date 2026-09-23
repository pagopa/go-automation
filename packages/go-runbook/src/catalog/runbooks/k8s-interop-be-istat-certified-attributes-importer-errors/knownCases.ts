import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { ISTAT_IMPORTER_ALARM as alarm } from './alarmDefinition.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
const UUID_PATTERN = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';

/** Confluence v7 plus PIN-10543/PIN-10823, checked on 2026-09-17. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'istat-certifier-tenant-not-found',
    description: 'Tenant certificatore ISTAT non trovato',
    priority: 100,
    regex: 'Certifier tenant ISTAT not found',
    resolution:
      'Consultare PIN-10543, risolta nella Core 2.21.0, e verificare la versione effettivamente installata e il servizio che emette il log tramite CID. ' +
      'La card include log di email-notification-dispatcher e ipotesi di causa riviste nei commenti: coinvolgere il team di prodotto per una ricorrenza dopo la correzione. ' +
      'Non applicare automaticamente modifiche al tenant o chiamate maintenance.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Il flusso non individua il tenant certificatore ISTAT; la causa specifica richiede verifica dei log correlati.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [
      'Verificare versione installata e servizio origine del log',
      'Verificare con il team di prodotto la ricorrenza di PIN-10543',
    ],
    links: [jiraLink('PIN-10543')],
  }),
  interopKnownCase(REFS, {
    id: 'istat-discrete-certified-attribute-already-assigned',
    description: 'Attributo certificato discreto già assegnato al tenant (409)',
    priority: 90,
    regex:
      `Certified Discrete Attribute\\s+${UUID_PATTERN}\\s+already assigned to tenant\\s+${UUID_PATTERN}\\b|` +
      'Error on internalAssignDiscreteCertifiedAttribute\\. Reason: Request failed with status code 409\\b',
    resolution:
      'Conflitto gestito: l’attributo con il relativo valore è già assegnato al tenant (commenti PIN-10543). ' +
      'PIN-10823 prevede il passaggio del log da ERROR a WARN nella Core 2.23.0, non l’eliminazione del 409. ' +
      'Verificare versione installata, livello e stream del log nell’ambiente dell’allarme: prima della correzione il duplicato è atteso; ' +
      'se continua ad attivare l’allarme dopo la correzione, segnalarlo al team di prodotto. La data di rilascio non dimostra il deploy.',
    // Deployment version/severity are not proven by matching the message alone.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Assegnazione duplicata già gestita; l’emissione come ERROR o stderr può attivare l’allarme.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [
      'Verificare deploy della correzione PIN-10823 e livello/stream del log',
      'Se l’allarme ricorre dopo la correzione, coinvolgere il team di prodotto',
    ],
    links: [jiraLink('PIN-10823'), jiraLink('PIN-10543')],
  }),
];
