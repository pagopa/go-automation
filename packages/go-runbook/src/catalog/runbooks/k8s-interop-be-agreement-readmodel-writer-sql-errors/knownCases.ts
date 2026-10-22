import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';

import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { AGREEMENT_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'agreement-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    description: 'Rejoin del consumer Kafka dell’agreement readmodel writer SQL; causa da verificare',
    priority: 100,
    // La pagina censisce solo Prod. Il commento 293001 di PIN-7325 riporta il writer senza CID.
    // Il tracker comprende altri servizi: il caso usa solo le evidenze applicative del writer.
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'The coordinator is not aware of this member,\\s*re-joining the group\\b',
      ),
    ),
    resolution:
      'PIN-7325 Nessuna azione se le occorrenze sono concentrate in una finestra di pochi minuti: \u00E8 una riconnessione momentanea al broker Kafka. Se persistono per ore, verificare lo stato del pod e segnalare al team di prodotto.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
      ['Evidenza documentale', 'PIN-7325, commento 293001: Prod, 13/02/2026, CID assente'],
      ['Causa e recupero', 'Da verificare per l’occorrenza in analisi'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Il coordinator Kafka non riconosce il consumer del writer SQL, che tenta il rejoin; causa e recupero da verificare.',
      // La pagina indica NA: non attribuire il caso a Selfcare o ad altri downstream esterni.
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773057607941239',
          name: 'Discussione Kafka 09/03/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
