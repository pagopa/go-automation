import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';

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
      'PIN-7325 Nessuna azione se le occorrenze sono concentrate in una finestra di pochi minuti: \u00E8 una riconnessione momentanea al broker Kafka. Se persistono per ore, verificare lo stato del pod e segnalare al team di prodotto.',
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
      finalActions: [],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
    },
  }),
];
