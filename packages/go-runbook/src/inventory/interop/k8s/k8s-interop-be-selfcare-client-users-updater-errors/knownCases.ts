import { SELFCARE_USERS_UPDATER_ALARM as ALARM } from './alarmDefinition.js';
import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import { type KnownCase, stepEvidenceMatches } from '../../../../engine/index.js';

const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: ALARM.stepIds.queryCidTracker,
  varPrefix: ALARM.varPrefix,
};

const PIN_7325 = [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }] as const;
// Confluence v12-v15 contains overlapping rows: a ticket reference and no resolution for the same Prod signatures.
const OVERLAPPING_RESOLUTION =
  'PIN-7325. In Produzione la stessa firma è riportata anche in una casistica senza risoluzione documentata.';

/** Sources: Confluence 2129330177 v9/v11-v15 and production logs of 2026-10-23. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'selfcare-users-updater-kafka-broker-errors',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'and',
          conditions: [
            { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
            stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, INTEROP_KAFKA_SIGNATURES.unknownMember),
          ],
        },
        {
          type: 'and',
          conditions: [
            { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test'] },
            stepEvidenceMatches(
              ALARM.stepIds.queryApplicationLogs,
              [
                'The group coordinator is not available',
                'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
                "The coordinator is loading and hence can['’]t process requests for this group",
              ].join('|'),
            ),
          ],
        },
      ],
    },
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'KafkaJS segnala errori di comunicazione con il coordinator o indisponibilità della replica.',
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    finalActions: [],
    links: PIN_7325,
  }),
  interopK8sKnownCase(REFS, {
    id: 'selfcare-kafka-metadata-timeout',
    description: 'Timeout della richiesta Metadata al cluster Kafka',
    environments: ['prod', 'test'],
    regex: 'KafkaJS\\s*NumberOfRetriesExceeded: Request Metadata\\(key: 3, version: 6\\) timed out',
    evidence: 'APPLICATION_LOGS',
    resolution: OVERLAPPING_RESOLUTION,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: PIN_7325,
  }),
  interopK8sKnownCase(REFS, {
    id: 'selfcare-kafka-connection-reset',
    description: 'Connessione Kafka interrotta con ECONNRESET',
    environments: ['prod', 'test'],
    regex: 'Connection error: read ECONNRESET\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: OVERLAPPING_RESOLUTION,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: PIN_7325,
  }),
  interopK8sKnownCase(REFS, {
    id: 'selfcare-kafka-tls-connection-interrupted',
    description: 'Connessione interrotta prima del completamento della connessione TLS',
    environments: ['prod'],
    regex: INTEROP_KAFKA_SIGNATURES.tlsDisconnected,
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: [],
  }),
];
