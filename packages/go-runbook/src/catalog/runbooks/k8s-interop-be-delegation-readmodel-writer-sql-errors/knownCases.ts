import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { DELEGATION_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'delegation-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il consumer del delegation readmodel writer SQL',
    priority: 100,
    // La pagina censisce Prod e Att e attribuisce il log al writer SQL.
    // Il tracker comprende altri servizi: il riconoscimento usa la query applicativa filtrata sul writer.
    condition: all(
      any(varEquals('interopEnvironment', 'prod'), varEquals('interopEnvironment', 'att')),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'The coordinator is not aware of this member,\\s*re-joining the group',
      ),
    ),
    resolution:
      'Consultare PIN-7325 e raccogliere timestamp, frequenza delle ricorrenze e log del writer SQL, anche senza CID. ' +
      'Verificare la ripresa del consumer e approfondire con il team di prodotto se il fenomeno persiste. ' +
      'La card descrive una perdita della sessione Kafka, possibile anche con elaborazione lenta o problemi di rete, ' +
      'e non documenta una correzione definitiva né criteri di chiusura.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il consumer Kafka ha perso la sessione di gruppo e tenta di effettuare il rejoin.',
      // La tabella indica NA: non viene attribuito un downstream esterno senza evidenze.
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Verificare la ripresa del consumer e la persistenza del problema con il team di prodotto'],
      links: [jiraLink('PIN-7325')],
    },
  }),
];
