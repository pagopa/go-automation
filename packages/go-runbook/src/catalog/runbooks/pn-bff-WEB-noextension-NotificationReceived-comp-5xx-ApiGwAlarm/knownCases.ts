import { knownCase, SEND_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches, anyStepEvidenceMatches } from '../common/evidenceConditions.js';
import { varExists } from '../common/varConditions.js';
import { jiraLink } from '../common/analysisLinks.js';

const FOLLOW_UP =
  'Verificare ricorrenza, impatto e richieste successive; coinvolgere il team prodotto se causa o ripresa non sono confermate';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'delivery-index-out-of-bounds',
    description: 'Errore di indice durante la ricerca delle notifiche ricevute in pn-delivery',
    priority: 650,
    condition: stepEvidenceMatches(
      'query-pn-delivery',
      '^(?=[\\s\\S]*PnInternalException)(?=[\\s\\S]*java\\.lang\\.IndexOutOfBoundsException: Index -1 out of bounds for length [0-9]+\\b)',
    ),
    resolution:
      'Correlare trace, stack_trace di pn-delivery e risposta API Gateway 500. Consultare PN-21515 e verificare stato del ticket e versione distribuita; la lunghezza riportata può variare e non va fissata a 53. Verificare le altre richieste fallite e le richieste successive: il riferimento al bug non prova il recupero della nuova occorrenza.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-delivery' }],
      links: [jiraLink('PN-21515')],
    },
  }),
  knownCase({
    id: 'delivery-dynamodb-filter-expression-too-large',
    description: 'Espressione filtro DynamoDB troppo grande durante la ricerca in pn-delivery',
    priority: 640,
    condition: stepEvidenceMatches(
      'query-pn-delivery',
      'DynamoDbException:[\\s\\S]*Invalid FilterExpression: Expression size has exceeded the maximum allowed size',
    ),
    resolution:
      'Il codice 400 nel messaggio è restituito da DynamoDB e non identifica da solo lo status HTTP del BFF. Correlare trace e access log, ricostruire il filtro di ricerca e coinvolgere il team pn-delivery. Non modificare limiti o dati DynamoDB come correzione automatica.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-delivery' }],
    },
  }),
  knownCase({
    id: 'delivery-date-range-reversed',
    description: 'Intervallo date con startDate successiva a endDate in pn-delivery',
    priority: 630,
    condition: stepEvidenceMatches(
      'query-pn-delivery',
      'IllegalArgumentException:[\\s\\S]*Start \\(YearAndMonth\\([\\s\\S]*can.t be after end \\(YearAndMonth',
    ),
    resolution:
      'Verificare i parametri startDate ed endDate senza copiare identificativi personali. Consultare PN-18576 e verificarne stato e versione distribuita; far correggere al chiamante l’intervallo e verificare una nuova richiesta. La casistica documentata non dimostra che ogni 500 della finestra abbia questa origine.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-delivery' }],
      links: [jiraLink('PN-18576')],
    },
  }),
  knownCase({
    id: 'delivery-data-vault-read-timeout',
    description: 'Timeout di lettura di pn-delivery verso Personal Data Vault',
    priority: 620,
    condition: stepEvidenceMatches(
      'query-pn-delivery',
      '^(?=[\\s\\S]*ResourceAccessException)(?=[\\s\\S]*/datavault-private/v1/recipients/internal)(?=[\\s\\S]*SocketTimeoutException: Read timed out)',
    ),
    resolution:
      'Correlare trace e chiamata a Personal Data Vault. Leggere anche WARN e stack_trace di Exception caught by retry; verificare esito e tempi dei tentativi e delle richieste successive. La presenza di un retry non dimostra che sia riuscito né che il chiamante abbia ricevuto una risposta positiva.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-delivery' }, { name: 'pn-data-vault' }],
    },
  }),
  knownCase({
    id: 'checkout-connect-timeout',
    description: 'Timeout di connessione verso Checkout pagoPA',
    priority: 610,
    condition: anyStepEvidenceMatches(
      ['query-pn-external-registries', 'query-pn-external-registries-checkout'],
      '\\[DOWNSTREAM\\] Service Checkout returned errors=connection timed out after [0-9]+ ms: api\\.platform\\.pagopa\\.it',
    ),
    resolution:
      'Correlare trace e access log BFF; identificare il servizio checkout effettivamente invocato e verificare rete, DNS e richieste successive. Il messaggio non prova una causa esclusivamente remota. Oscurare token, codici fiscali e identificativi di pagamento nelle evidenze; coinvolgere il team prodotto se il problema persiste.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-external-registries-checkout' }],
      downstreams: [SEND_DOWNSTREAMS.CHECKOUT_PAGOPA],
    },
  }),
  knownCase({
    id: 'bff-payments-info-read-timeout',
    description: 'Timeout BFF durante getPaymentsInfoV1 verso pn-external-registries',
    priority: 500,
    condition: all(
      varExists('externalRegistriesLogCount'),
      stepEvidenceMatches(
        'query-pn-bff',
        'Ending process _getPaymentsInfoV1 with errors=nested exception is io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
      ),
    ),
    resolution:
      'Verificare log correlati di pn-external-registries e, se invocato, del servizio checkout. Ricostruire tempi, retry e risposte; l’errore non dimostra una fluttuazione innocua della connettività. Se mancano log, verificare identificatori, intervallo, permessi, ingestione e retention.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-external-registries' }],
    },
  }),
  knownCase({
    id: 'bff-delivery-read-timeout',
    description: 'Timeout BFF durante la chiamata a pn-delivery',
    priority: 490,
    condition: all(
      varExists('deliveryLogCount'),
      stepEvidenceMatches(
        'query-pn-bff',
        '^(?=[\\s\\S]*ReadTimeoutException\\b)(?=[\\s\\S]*Request to GET https?://[^\\s"\\\\]+/delivery/notifications/(?:received|sent))',
      ),
    ),
    resolution:
      'Confrontare trace e timestamp BFF/pn-delivery, cercando l’errore e l’esito delle richieste a valle. Verificare rete, risorse e richieste successive. Un 200 successivo in pn-delivery o un retry non dimostrano che il BFF abbia ricevuto il risultato entro la propria attesa.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-delivery' }],
    },
  }),
  knownCase({
    id: 'bff-connection-observed-error',
    description: 'Errore di connessione osservato dal BFF con causa da verificare',
    priority: 100,
    condition: all(
      any(varExists('deliveryLogCount'), varExists('externalRegistriesLogCount')),
      stepEvidenceMatches('query-pn-bff', 'The connection observed an error'),
    ),
    resolution:
      'Il warning è un sintomo: identificare destinazione ed eccezione sottostante nello stesso trace. Non attribuire automaticamente un disservizio a rete, pn-delivery o pn-external-registries e non chiudere per la sola sporadicità. Verificare impatto e richieste successive; coinvolgere il prodotto se mancano evidenze sufficienti.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
    },
  }),
];
