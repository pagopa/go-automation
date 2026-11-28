import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import {
  all,
  any,
  anyStepEvidenceMatches,
  type KnownError,
  BRANCH_OUTCOME_VAR,
  stepEvidenceMatches,
  varEquals,
  varExists,
} from '../../../../engine/index.js';

// The BFF error is the diagnosis only when the branch below it is complete and recognizes nothing more specific.
const BRANCH_UNDIAGNOSED = varEquals(BRANCH_OUTCOME_VAR, 'undiagnosed');

export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_DEL-IND-OUT-OF-BOU',
    description: 'Errore di indice durante la ricerca delle notifiche ricevute in pn-delivery',
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
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_DEL-DYN-FIL-EXP-TOO-LAR',
    description: 'Espressione filtro DynamoDB troppo grande durante la ricerca in pn-delivery',
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
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_DEL-DAT-RAN-REV',
    description: 'Intervallo date con startDate successiva a endDate in pn-delivery',
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
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_DEL-DAT-VAU-REA-TIM',
    description: 'Timeout di lettura di pn-delivery verso Personal Data Vault',
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
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_CHE-CON-TIM',
    description: 'Timeout di connessione verso Checkout pagoPA',
    condition: anyStepEvidenceMatches(
      ['query-pn-external-registries', 'query-pn-external-registries-checkout'],
      `${downstreamMarkerPattern('Checkout')}connection timed out after [0-9]+ ms: api\\.platform\\.pagopa\\.it`,
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
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_BFF-PAY-INF-REA-TIM',
    description: 'Timeout BFF durante getPaymentsInfoV1 verso pn-external-registries',
    condition: all(
      BRANCH_UNDIAGNOSED,
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
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_BFF-DEL-REA-TIM',
    description: 'Timeout BFF durante la chiamata a pn-delivery',
    condition: all(
      BRANCH_UNDIAGNOSED,
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
  knownError({
    code: 'SEND_APIGW_PBWEBNNRC5AGA_BFF-CON-OBS-ERR',
    description: 'Errore di connessione osservato dal BFF con causa da verificare',
    condition: all(
      BRANCH_UNDIAGNOSED,
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
