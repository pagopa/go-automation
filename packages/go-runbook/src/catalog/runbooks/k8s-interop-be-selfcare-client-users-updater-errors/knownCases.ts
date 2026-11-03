import { SELFCARE_USERS_UPDATER_ALARM as ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${ALARM.varPrefix}CidCount}}`],
] as const;

const PIN_7325 = [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }] as const;
// Confluence v12-v15 contains overlapping rows: a ticket reference and no resolution for the same Prod signatures.
const OVERLAPPING_RESOLUTION =
  'PIN-7325. In Produzione la stessa firma è riportata anche in una casistica senza risoluzione documentata.';

/** Sources: Confluence 2129330177 v9/v11-v15 and production logs of 2026-10-23. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'selfcare-kafka-broker-communication-errors',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    priority: 100,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'and',
          conditions: [
            { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
            stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, 'The coordinator is not aware of this member'),
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
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'KafkaJS segnala errori di comunicazione con il coordinator o indisponibilità della replica.',
      downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: PIN_7325,
    },
  }),
  knownCase({
    id: 'selfcare-kafka-metadata-timeout',
    description: 'Timeout della richiesta Metadata al cluster Kafka',
    priority: 120,
    condition: {
      type: 'and',
      conditions: [
        { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test'] },
        stepEvidenceMatches(
          ALARM.stepIds.queryApplicationLogs,
          'KafkaJS\\s*NumberOfRetriesExceeded: Request Metadata\\(key: 3, version: 6\\) timed out',
        ),
      ],
    },
    resolution: OVERLAPPING_RESOLUTION,
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: PIN_7325,
    },
  }),
  knownCase({
    id: 'selfcare-kafka-connection-reset',
    description: 'Connessione Kafka interrotta con ECONNRESET',
    priority: 110,
    condition: {
      type: 'and',
      conditions: [
        { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test'] },
        stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, 'Connection error: read ECONNRESET\\b'),
      ],
    },
    resolution: OVERLAPPING_RESOLUTION,
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: PIN_7325,
    },
  }),
  knownCase({
    id: 'selfcare-kafka-tls-connection-interrupted',
    description: 'Connessione interrotta prima del completamento della connessione TLS',
    priority: 130,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
        stepEvidenceMatches(
          ALARM.stepIds.queryApplicationLogs,
          'Connection error: Client network socket disconnected before secure TLS connection was established',
        ),
      ],
    },
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
