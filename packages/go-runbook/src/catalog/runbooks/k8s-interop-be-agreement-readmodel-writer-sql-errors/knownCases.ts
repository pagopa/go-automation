import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink, slackLink } from '../common/analysisLinks.js';
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
      'Consultare PIN-7325: il commento 293001 documenta il medesimo writer in Prod il 13/02/2026, senza CID. ' +
      'L’associazione della famiglia di errori è supportata, ma la causa della nuova occorrenza resta da verificare. ' +
      'Il consumer non è più riconosciuto dal coordinator e tenta il rejoin; PIN-7325 contempla sia problemi di rete ' +
      'sia elaborazione lenta e perdita della sessione del consumer group. ' +
      'Raccogliere timestamp, frequenza delle ricorrenze e log del writer e verificare la ripresa del consumer. ' +
      'Usare i CID per la correlazione quando presenti; in loro assenza cercare per pod e intervallo temporale, ' +
      'ampliando la finestra se necessario. Se il fenomeno persiste o la ripresa non è verificabile, coinvolgere il team di prodotto ' +
      'con le evidenze raccolte. La pagina e la card non specificano una correzione definitiva, soglie di escalation ' +
      'o criteri di chiusura: il solo messaggio di rejoin non prova il recupero e l’analisi resta aperta.',
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
      finalActions: ['Raccogliere le ricorrenze e verificare la ripresa del consumer con il team di prodotto'],
      links: [
        jiraLink('PIN-7325'),
        slackLink('https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773057607941239', 'Discussione Kafka 09/03/2026'),
      ],
    },
  }),
];
