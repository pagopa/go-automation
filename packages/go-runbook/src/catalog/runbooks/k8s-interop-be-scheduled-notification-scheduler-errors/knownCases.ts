import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { NOTIFICATION_SCHEDULER_ALARM as alarm } from './alarmDefinition.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'notification-scheduler-kafka-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il consumer dello scheduled notification scheduler',
    priority: 100,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      // Only the scheduler error scan is evidence; the CID tracker spans other services.
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'ERROR\\s*-\\s*(?:Response Heartbeat\\(key:\\s*12, version:\\s*\\d+\\)\\s*-\\s*The coordinator is not aware of this member\\b|The coordinator is not aware of this member,\\s*re-joining the group\\b)',
      ),
    ),
    resolution:
      'Il consumer tenta di rientrare nel gruppo perché il coordinator non riconosce il member. ' +
      'Questo non dimostra una mancata connessione al broker né identifica da solo la causa: verificare ' +
      'perdita della sessione, rete e durata delle elaborazioni. Raccogliere ambiente, orari UTC, pod/log stream ' +
      'e log completi, distinguendo ogni episodio. Usare i CID quando presenti; in loro assenza leggere ' +
      'il contesto dello scheduler per pod e intervallo, includendo INFO, WARN e DEBUG. ' +
      'Verificare ripresa del consumer, avanzamento degli eventi del catalogo e schedulazioni attese, ' +
      'senza arretrato crescente o errori irrisolti. Le notifiche sono pianificate dallo scheduler: ' +
      'non dedurre la loro consegna finale dal solo consumo dell’evento. ' +
      'Rejoin, token ottenuto e ritorno dell’allarme a OK non provano da soli il recupero. ' +
      'La durata di circa un minuto è un’indicazione storica, non una soglia di chiusura. ' +
      'Se manca carico o la ripresa non è verificabile, mantenere l’analisi aperta; se il consumer non avanza, ' +
      'il crash si ripete o l’arretrato cresce, coinvolgere il team di prodotto Interoperabilità senza attendere ore o giorni. ' +
      'Verificare eventuali manutenzioni o cambiamenti solo se correlati all’episodio. ' +
      'Nessun riavvio, rilancio di eventi o modifica delle schedulazioni durante la verifica in sola lettura.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Kafka segnala member sconosciuto durante heartbeat o rejoin; causa e ripresa delle schedulazioni da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
    },
  }),
];
