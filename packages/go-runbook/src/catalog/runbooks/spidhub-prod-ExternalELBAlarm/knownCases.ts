import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { varEquals } from '../common/varConditions.js';

const FOLLOW_UP =
  'Nell’account confinfo di produzione correlare orario, metodo, percorso e identificativo della richiesta ' +
  'con gli access log del load balancer esterno, disponibili nel bucket pn-spidhub-alb-log-350578575906-eu-south-1. ' +
  'Distinguere elb_status_code e target_status_code; usare anche l’orario di creazione della richiesta, ' +
  'perché la risposta può arrivare dopo un timeout. Verificare target health e contesto del medesimo log stream. ' +
  'Se i log non permettono la correlazione, coinvolgere Infra e l’owner pn-hub-spid-login-aws. ' +
  'Non dedurre il recupero da log vuoti o dal solo ritorno dell’allarme in OK: documentare ' +
  'l’esito delle richieste di autenticazione interessate e l’assenza di ricorrenze. Mantenere l’analisi aperta ' +
  'finché causa, impatto e recupero non sono verificati.';

const ANALYSIS = {
  proposedStatus: 'IN_PROGRESS',
  analysisType: 'ANALYZABLE',
  finalActions: [
    "Ho dubbi sulla criticità dell'allarme, riporto nel canale ufficiale il link all'analisi e chiedo un feedback al team Architettura",
  ],
} as const;

const DETAILS = [
  ['Servizio', 'pn-hub-spid-login-aws'],
  ['Account', '350578575906'],
  ['Log di errore', '{{vars.spidHubErrorLogCount}}'],
  ['Stream osservati', '{{vars.spidHubStreamCount}}'],
  ['Errori SAML Responder', '{{vars.spidHubResponderCount}}'],
  ['Errori headers già inviati', '{{vars.spidHubHeadersSentCount}}'],
] as const;

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'spidhub-headers-already-sent',
    description: 'ERR_HTTP_HEADERS_SENT nei log SPID Hub: correlazione HTTP ancora da verificare',
    priority: 110,
    condition: { type: 'compare', ref: 'vars.spidHubHeadersSentCount', operator: '>', value: 0 },
    level: 'warn',
    resolution:
      `L’applicazione tenta di modificare gli header dopo aver inviato la risposta. ` +
      `La presenza dell’eccezione nella finestra non dimostra che abbia causato l’allarme o un 504. ${FOLLOW_UP}`,
    details: DETAILS,
    analysis: ANALYSIS,
  }),
  knownCase({
    id: 'spidhub-saml-responder',
    description: 'Firma storica SAML Responder: causa HTTP e recupero ancora da verificare',
    priority: 100,
    condition: { type: 'compare', ref: 'vars.spidHubResponderCount', operator: '>', value: 0 },
    level: 'warn',
    resolution:
      `La firma io-spid-commons con StatusCode Responder è documentata nell’occorrenza del 21/06/2026. ` +
      `Indica una risposta SAML di errore e non prova un guasto del load balancer, un errore HTTP 500 ` +
      `o un’interruzione momentanea già recuperata. ${FOLLOW_UP}`,
    details: DETAILS,
    analysis: ANALYSIS,
  }),
  knownCase({
    id: 'spidhub-alb-correlation-required',
    description: 'Log SPID Hub raccolti: diagnosi ALB e autenticazione da completare',
    priority: 1,
    condition: varEquals('spidHubDiagnostics', 'COLLECTED'),
    level: 'warn',
    resolution:
      `L’allarme può riguardare errori del load balancer o risposte dei target. ` +
      `Il 18/09/2026 è stato osservato un 504 su POST /acs senza codice di risposta del target; ` +
      `questo precedente non determina la causa delle nuove occorrenze. ${FOLLOW_UP}`,
    details: DETAILS,
    analysis: ANALYSIS,
  }),
];
