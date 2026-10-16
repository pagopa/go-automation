import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';
import { M2M_EVENT_DISPATCHER_ALARM } from './alarmDefinition.js';

const REFS = {
  applicationLogsStepId: M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: M2M_EVENT_DISPATCHER_ALARM.stepIds.queryCidTracker,
  varPrefix: M2M_EVENT_DISPATCHER_ALARM.varPrefix,
};

const RECOVERY_CHECKS =
  'Verificare nei log successivi dello stesso consumer group la riconnessione o il rejoin e confermare avanzamento degli offset o degli eventi e smaltimento del lag. Il solo stato OK, l’assenza di errori e l’acquisizione di un token AWS non provano il recupero. Se gli errori persistono o manca evidenza di ripresa, mantenere aperta l’analisi e coinvolgere il team prodotto. Verificare eventuale manutenzione MSK nella finestra specifica; una chiusura storica per manutenzione non basta.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'm2m-consumer-crash',
    description: 'Crash del consumer Kafka dopo esaurimento dei tentativi',
    priority: 120,
    regex: 'Crash: KafkaJSNumberOfRetriesExceeded|Error Consumer crashed',
    resolution: `Verificare KafkaJSNumberOfRetriesExceeded e il campo restart nel consumer.crash. Con restart:false non presumere un riavvio automatico: verificare stato del pod e consumer attivi, coinvolgendo il team prodotto per le azioni di ripristino autorizzate. ${
      RECOVERY_CHECKS
    }`,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare restart, consumer attivi e avanzamento degli eventi con il team prodotto'],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-connection-refused',
    description: 'Connessione al broker Kafka rifiutata',
    priority: 110,
    regex: 'Connection error: connect ECONNREFUSED',
    resolution: `Correlare host e porta con il broker configurato. Verificare disponibilità del broker e connettività dal pod, eventuali crash del consumer ed errori di autorizzazione o saturazione. ECONNREFUSED non dimostra la causa del rifiuto. ${
      RECOVERY_CHECKS
    }`,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare broker, connettività e ripresa del consumer'],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-wrong-coordinator',
    description: 'Coordinator Kafka non corretto per il consumer group',
    priority: 100,
    regex: 'This is not the correct coordinator for this group',
    resolution: `Consultare PIN-7325 e PIN-8733, verificare rediscovery del coordinator e rejoin. ${RECOVERY_CHECKS}`,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare coordinator, rejoin e avanzamento degli eventi'],
    links: [jiraLink('PIN-7325'), jiraLink('PIN-8733')],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    priority: 90,
    regex: 'The coordinator is not aware of this member',
    resolution: `Consultare PIN-7325. Il messaggio può accompagnare un rejoin, che va verificato. ${RECOVERY_CHECKS}`,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare rejoin e avanzamento degli eventi prima di concludere'],
    links: [jiraLink('PIN-7325')],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-connection-timeout-tls',
    description: 'Timeout di connessione o interruzione prima della negoziazione TLS',
    priority: 80,
    regex:
      'Connection timeout|Connection error: Client network socket disconnected before secure TLS connection was established',
    resolution: `Identificare il broker interessato; verificare rete, DNS, TLS ed eventuali errori di accesso o saturazione. Non attribuire automaticamente l’errore a un problema transitorio. ${
      RECOVERY_CHECKS
    }`,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare connessione, TLS e ripresa degli eventi'],
  }),
];
