import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';

import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { CATALOG_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'catalog-readmodel-writer-temporary-network-errors',
    description: 'Errore di connessione del catalog readmodel writer SQL; temporaneità da verificare',
    priority: 100,
    // Entrambi i casi sono censiti solo in Prod; il tracker comprende anche altri servizi.
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'ERROR\\s*-\\s*Connection\\s+(?:timeout\\b|error:\\s*Client network socket disconnected before secure TLS connection was established\\b)',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Timeout o socket interrotto prima della connessione TLS; controparte, durata e recupero da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'catalog-readmodel-writer-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del catalog readmodel writer SQL',
    priority: 90,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'The coordinator is not aware of this member,\\s*re-joining the group\\s*-\\s*The coordinator is not aware of this member\\b',
      ),
    ),
    resolution: 'PIN-7325',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Il consumer tenta il rejoin perché il coordinator non lo riconosce; causa e recupero da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
    },
  }),
];
