import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { IN_APP_NOTIFICATION_DISPATCHER_ALARM as alarm } from './alarmDefinition.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'in-app-notification-dispatcher-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il consumer dell’in-app notification dispatcher',
    priority: 100,
    // Confluence censisce solo Prod e attribuisce il messaggio al dispatcher.
    // La query applicativa è filtrata sul suo pod; il CID tracker include anche altri servizi.
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'The coordinator is not aware of this member,\\s*re-joining the group',
      ),
    ),
    resolution:
      'Consultare PIN-7325 e raccogliere timestamp, frequenza delle ricorrenze e log del dispatcher, anche senza CID. ' +
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
      // Selfcare è il downstream dichiarato dalla pagina; l’attribuzione resta da confermare.
      downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
      finalActions: ['Verificare la ripresa del consumer e la persistenza del problema con il team di prodotto'],
      links: [jiraLink('PIN-7325')],
    },
  }),
];
