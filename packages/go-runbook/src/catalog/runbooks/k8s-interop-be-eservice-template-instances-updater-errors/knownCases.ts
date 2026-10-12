import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { ESERVICE_TEMPLATE_INSTANCES_UPDATER_ALARM as alarm } from './alarmDefinition.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'eservice-template-instances-updater-kafka-coordinator-unknown-member',
    description: 'Il coordinator Kafka non riconosce il consumer dell’updater delle istanze di template',
    priority: 100,
    // La pagina censisce l’heartbeat in Prod; il commento 354627 di PIN-7325 contiene anche il rejoin.
    // Entrambi i messaggi devono provenire dalla query applicativa filtrata sull’updater, non dal tracker.
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      any(
        stepEvidenceMatches(
          alarm.stepIds.queryApplicationLogs,
          'Response Heartbeat\\(key:\\s*12,\\s*version:\\s*3\\)\\s*-\\s*The coordinator is not aware of this member\\b',
        ),
        stepEvidenceMatches(
          alarm.stepIds.queryApplicationLogs,
          'The coordinator is not aware of this member,\\s*re-joining the group\\b',
        ),
      ),
    ),
    resolution:
      'Consultare PIN-7325: il commento 354627 documenta questo updater in Prod il 30/09/2026, senza CID, ' +
      'con errore di heartbeat e successivo tentativo di rejoin. Il coordinator non riconosce il consumer come membro del gruppo. ' +
      'La card contempla perdita della sessione per problemi di rete o elaborazione lenta; il messaggio da solo ' +
      'non dimostra un problema di connessione al cluster né il recupero del consumer. ' +
      'Raccogliere timestamp, frequenza delle ricorrenze e log dell’updater e verificare la ripresa del consumer. ' +
      'Usare i CID quando disponibili; in loro assenza cercare per pod e intervallo temporale, ampliando la finestra se necessario. ' +
      'Se il fenomeno persiste o la ripresa non è verificabile, coinvolgere il team di prodotto con le evidenze raccolte. ' +
      'Pagina e card non indicano una correzione definitiva, soglie di durata e frequenza o criteri di chiusura ed escalation: ' +
      'il riconoscimento dell’heartbeat o del rejoin mantiene l’analisi aperta.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
      ['Evidenza documentale', 'PIN-7325, commento 354627: Prod, 30/09/2026, CID assente'],
      ['Causa e recupero', 'Da verificare per l’occorrenza in analisi'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Il coordinator Kafka non riconosce il consumer dell’updater; causa e ripresa dell’elaborazione da verificare.',
      // Downstream NA nella pagina: nessuna attribuzione a servizi esterni senza evidenze.
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Raccogliere le ricorrenze e verificare la ripresa del consumer con il team di prodotto'],
      links: [jiraLink('PIN-7325')],
    },
  }),
];
