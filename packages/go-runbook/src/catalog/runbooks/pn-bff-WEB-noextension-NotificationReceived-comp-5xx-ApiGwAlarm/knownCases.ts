import { knownCase, SEND_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches, anyStepEvidenceMatches } from '../common/evidenceConditions.js';
import { varExists } from '../common/varConditions.js';

// DecideNextStep sets this only when the reachable traversal stops.
const TRAVERSAL_FINISHED = varExists('terminationReason');

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'delivery-index-out-of-bounds',
    description: 'Errore di indice durante la ricerca delle notifiche ricevute in pn-delivery',
    priority: 650,
    condition: stepEvidenceMatches(
      'query-pn-delivery',
      '^(?=[\\s\\S]*PnInternalException)(?=[\\s\\S]*java\\.lang\\.IndexOutOfBoundsException: Index -1 out of bounds for length [0-9]+\\b)',
    ),
    resolution: 'PN-21515',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-delivery' }],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PN-21515', name: 'PN-21515', type: 'JIRA' }],
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
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-delivery' }],
      links: [],
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
    resolution: 'Bug: PN-18576 Thread Slack: 23/02/2026',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-delivery' }],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PN-18576', name: 'PN-18576', type: 'JIRA' }],
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
      'Note: l\u2019errore si \u00E8 presentato con poche volte in un intervallo temporale di circa mezzora. I messaggi riportati in questa tabella erano in log con severity warning. La stringa sul timeout di pn-delivery verso data-vault si trovava all\u2019interno dello stack-trace, il messaggio invece era del tipo Exception caught by retry . Da verificare se \u00E8 possibile trattarlo come un errore gestito.',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-delivery' }, { name: 'pn-data-vault' }],
      links: [],
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
    resolution: 'Thread Slack 21/09/2026',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-external-registries-checkout' }],
      downstreams: [SEND_DOWNSTREAMS.CHECKOUT_PAGOPA],
      links: [],
    },
  }),
  knownCase({
    id: 'bff-payments-info-read-timeout',
    description: 'Timeout BFF durante getPaymentsInfoV1 verso pn-external-registries',
    priority: 500,
    condition: all(
      TRAVERSAL_FINISHED,
      varExists('externalRegistriesLogCount'),
      stepEvidenceMatches(
        'query-pn-bff',
        'Ending process _getPaymentsInfoV1 with errors=nested exception is io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
      ),
    ),
    resolution:
      'Considerando la natura sporadica dell\u2019anomalia, viene considerata una normale fluttuazione randomica della connettivit\u00E0 tra i ms',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-external-registries' }],
      links: [],
    },
  }),
  knownCase({
    id: 'bff-delivery-read-timeout',
    description: 'Timeout BFF durante la chiamata a pn-delivery',
    priority: 490,
    condition: all(
      TRAVERSAL_FINISHED,
      varExists('deliveryLogCount'),
      stepEvidenceMatches(
        'query-pn-bff',
        '^(?=[\\s\\S]*ReadTimeoutException\\b)(?=[\\s\\S]*Request to GET https?://[^\\s"\\\\]+/delivery/notifications/(?:received|sent))',
      ),
    ),
    resolution:
      'Problema causato da errori di connettivit\u00E0 (ReadTimeout) verso pn-delivery. Nota: in alcune analisi \u00E8 stato possibile verificare che il problema \u00E8 stato temporaneo e che \u00E8 stato comunque gestito tramite retry da pn-delivery con un 200 sul',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-delivery' }],
      links: [],
    },
  }),
  knownCase({
    id: 'bff-connection-observed-error',
    description: 'Errore di connessione osservato dal BFF con causa da verificare',
    priority: 100,
    condition: all(
      TRAVERSAL_FINISHED,
      any(varExists('deliveryLogCount'), varExists('externalRegistriesLogCount')),
      stepEvidenceMatches('query-pn-bff', 'The connection observed an error'),
    ),
    resolution:
      'Considerando la natura sporadica dell\u2019anomalia, viene considerata una normale fluttuazione randomica della connettivit\u00E0 tra i ms',
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
