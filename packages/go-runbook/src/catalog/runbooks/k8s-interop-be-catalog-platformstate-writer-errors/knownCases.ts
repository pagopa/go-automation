import { CATALOG_PLATFORMSTATE_WRITER_ALARM as alarm } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase, type Condition } from '../framework.js';

import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
] as const;
function writerEvidence(regex: string): Condition {
  // The CID tracker spans other applications: their signatures are context,
  // not proof that this writer generated the failure. Cases are documented in Prod.
  return all(varEquals('interopEnvironment', 'prod'), stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, regex));
}
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'catalog-platformstate-writer-kafka-retries-exhausted',
    description: 'Consumer Kafka del catalog platformstate writer in crash con retry esauriti',
    priority: 200,
    condition: writerEvidence(
      '(?:Crash:\\s*KafkaJSNumberOfRetriesExceeded\\b|Error Consumer crashed\\b[^\\n]*KafkaJSNumberOfRetriesExceeded\\b)',
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'KafkaJSNumberOfRetriesExceeded: consumer in crash; ripresa effettiva da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'catalog-platformstate-writer-temporary-network-errors',
    description: 'Errore di connessione del catalog platformstate writer; temporaneità da verificare',
    priority: 100,
    condition: writerEvidence(
      'ERROR\\s*-\\s*Connection\\s+(?:timeout\\b|error:\\s*(?:Client network socket disconnected before secure TLS connection was established\\b|connect ECONNREFUSED\\b))',
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Timeout, socket TLS interrotto o connessione rifiutata; causa e recupero da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'catalog-platformstate-writer-kafka-coordinator-member-rejoin',
    description: 'Errore di membership o coordinator Kafka del catalog platformstate writer',
    priority: 90,
    condition: writerEvidence(
      '(?:Response Heartbeat\\(key:\\s*12, version:\\s*3\\)\\s*-\\s*(?:The coordinator is not aware of this member\\b|This is not the correct coordinator for this group\\b)|The coordinator is not aware of this member,\\s*re-joining the group\\s*-\\s*The coordinator is not aware of this member\\b)',
    ),
    resolution: 'PIN-7325',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il consumer segnala member sconosciuto o coordinator non corretto; ripresa da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
    },
  }),
];
