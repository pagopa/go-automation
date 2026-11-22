import { CATALOG_PLATFORMSTATE_WRITER_ALARM as alarm } from './alarmDefinition.js';
import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
// The CID tracker spans other applications: their signatures are context,
// not proof that this writer generated the failure. Cases are documented in Prod.
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'catalog-platformstate-writer-kafka-retries-exhausted',
    description: 'Consumer Kafka del catalog platformstate writer in crash con retry esauriti',
    environments: ['prod'],
    regex:
      '(?:Crash:\\s*KafkaJSNumberOfRetriesExceeded\\b|Error Consumer crashed\\b[^\\n]*KafkaJSNumberOfRetriesExceeded\\b)',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'KafkaJSNumberOfRetriesExceeded: consumer in crash; ripresa effettiva da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'catalog-platformstate-writer-temporary-network-errors',
    description: 'Errore di connessione del catalog platformstate writer; temporaneità da verificare',
    environments: ['prod'],
    regex: interopErrorLine(
      INTEROP_KAFKA_SIGNATURES.connectionTimeout,
      INTEROP_KAFKA_SIGNATURES.tlsDisconnected,
      INTEROP_KAFKA_SIGNATURES.connectionRefused,
    ),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Timeout, socket TLS interrotto o connessione rifiutata; causa e recupero da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'catalog-platformstate-writer-kafka-coordinator-member-rejoin',
    description: 'Errore di membership o coordinator Kafka del catalog platformstate writer',
    environments: ['prod'],
    regex: `(?:${INTEROP_KAFKA_SIGNATURES.unknownMemberHeartbeat}|${INTEROP_KAFKA_SIGNATURES.wrongCoordinatorResponse}|${INTEROP_KAFKA_SIGNATURES.unknownMemberRejoinWithReason})`,
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer segnala member sconosciuto o coordinator non corretto; ripresa da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
