/**
 * Known cases for the pn-delivery-B2B-ApiGwAlarm runbook.
 */

import { SEND_DOWNSTREAMS, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';
import { all, any, not } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { apiGwPathMatches, apiGwStatusIs } from '../../../apigw/knownCases/conditions.js';

const SELFCARE_500_THREAD = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1763476967853039';
const NO_APPLICATION_LOGS_THREAD = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1771856191424399';
const F24_GONE_THREAD_27_MAY = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779875991448379';
const F24_GONE_THREAD_7_JULY = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1783422596434969';
const MISSING_PAYMENT_THREAD_GO = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779973763295549';
const MISSING_PAYMENT_THREAD_DELIVERY = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1779974451222819';
const DOCUMENT_INDEX_THREAD = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1786977695806849';

const EXTERNAL_REGISTRIES_SELFCARE_READ_TIMEOUT = any(
  stepEvidenceMatches(
    'query-pn-external-registries',
    '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=[\\s\\S]*io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
  ),
  all(
    stepEvidenceMatches(
      'query-pn-external-registries',
      'Request to GET https://api\\.selfcare\\.pagopa\\.it/external/v2/user-groups',
    ),
    stepEvidenceMatches(
      'query-pn-external-registries',
      'Caused by: io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
    ),
  ),
);

const EXTERNAL_REGISTRIES_SELFCARE_RETRY_TIMEOUT = all(
  stepEvidenceMatches('query-pn-external-registries', 'Exception caught by retry'),
  stepEvidenceMatches(
    'query-pn-external-registries',
    'ResourceAccessException:[\\s\\S]*ext-registry-private/pa/v1/groups-all[\\s\\S]*Read timed out',
  ),
);

const EXTERNAL_REGISTRIES_CONNECTION_ABORTED = stepEvidenceMatches(
  'query-pn-external-registries',
  'reactor\\.netty\\.channel\\.AbortedException: Connection has been closed BEFORE send operation',
);

/**
 * Actionable/manual cases use the 500 range. Automatically closable cases
 * use the 200 range, so a benign overlap can never hide work still required.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'pdv-tokenizer-404-tbd',
    description: 'Personal Data Vault Tokenizer restituisce 404 Not Found',
    priority: 550,
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      '\\[DOWNSTREAM\\] Service PersonalDataVault_Tokenizer returned errors=404 Not Found',
    ),
    title: '[DOWNSTREAM] PersonalDataVault_Tokenizer - 404 Not Found',
    resolution: 'TBD nel documento: approfondire la risposta 404 del downstream Personal Data Vault.',
    details: [
      ['Downstream', 'Personal Data Vault'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.PERSONAL_DATA_VAULT],
      finalActions: ['Approfondire la risposta 404 del tokenizer Personal Data Vault'],
    },
  }),

  knownCase({
    id: 'pn-ss-pn-f24-read-forbidden',
    description: 'Il client pn-f24 non ha i privilegi di lettura sul documento Safe Storage',
    priority: 540,
    condition: stepEvidenceMatches(
      'query-pn-safestorage',
      'Ending process getFile\\(\\) with errors=403 FORBIDDEN[\\s\\S]*Client\\s*:\\s*pn-f24 not has privilege for read document',
    ),
    title: 'Safe Storage 403 - pn-f24 privo dei privilegi di lettura',
    resolution:
      'Verificare che la notifica sia associata all’ente “Comune di Monte San Savino” prima di chiudere il caso.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.safeStorageErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
      finalActions: [
        'Estrapolare lo IUN e verificare senderDenomination nella tabella pn-Notifications',
        'Confermare che il mittente sia Comune di Monte San Savino',
      ],
    },
  }),

  knownCase({
    id: 'pn-f24-safe-storage-metadata-gone',
    description: 'PN-F24 riceve 410 Gone recuperando i metadati F24 da Safe Storage',
    priority: 530,
    condition: all(
      apiGwStatusIs('500'),
      apiGwPathMatches('/attachments/payment/[^/]+/F24$'),
      stepEvidenceMatches(
        'query-pn-f24',
        '410 Gone from GET[\\s\\S]*safe-storage/v1/files/PN_F24_META-[^\\s";]+\\.json',
      ),
    ),
    title: 'PN-F24 - metadati Safe Storage rimossi (410 Gone)',
    resolution:
      'Verificare l’ente mittente della notifica; nei casi osservati il mittente era Comune di Monte San Savino.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore PN-F24', '{{vars.f24ErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [
        'Estrapolare lo IUN e verificare senderDenomination nella tabella pn-Notifications',
        'Confermare che il mittente sia Comune di Monte San Savino',
      ],
      links: [
        slackLink(F24_GONE_THREAD_27_MAY, 'Thread Slack 27/05/2026'),
        slackLink(F24_GONE_THREAD_7_JULY, 'Thread Slack 07/07/2026'),
      ],
    },
  }),

  knownCase({
    id: 'delivery-document-index-out-of-bounds',
    description: 'Indice documento -1 causa ArrayIndexOutOfBoundsException su pn-delivery',
    priority: 299,
    condition: all(
      apiGwStatusIs('500'),
      apiGwPathMatches('/attachments/documents/-1$'),
      stepEvidenceMatches(
        'query-pn-delivery',
        'PnInternalException:[\\s\\S]*nested exception is java\\.lang\\.ArrayIndexOutOfBoundsException',
      ),
    ),
    title: 'pn-delivery - indice documento non valido (-1)',
    resolution: 'Caso noto documentato nel thread Slack del 17/08/2026.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.deliveryErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [slackLink(DOCUMENT_INDEX_THREAD, 'Thread Slack 17/08/2026')],
    },
  }),

  knownCase({
    id: 'delivery-missing-payment-attachment-index',
    description: 'Notifica priva dell’indice dell’allegato di pagamento richiesto',
    priority: 298,
    condition: all(
      apiGwStatusIs('500'),
      apiGwPathMatches('/attachments/payment/[^/]+/PAGOPA$'),
      stepEvidenceMatches(
        'query-pn-delivery',
        'AUD_NT_ATCHOPEN_SND[\\s\\S]*Notification without payment attachment index[\\s\\S]*PN_DELIVERY_NOTIFICATIONWITHOUTPAYMENTATTACHMENT',
      ),
    ),
    title: 'pn-delivery - payment attachment index assente',
    resolution: 'Caso noto documentato nei thread Slack del 28/05/2026.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.deliveryErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [
        slackLink(MISSING_PAYMENT_THREAD_GO, 'Thread Slack GO 28/05/2026'),
        slackLink(MISSING_PAYMENT_THREAD_DELIVERY, 'Thread Slack Delivery 28/05/2026'),
      ],
    },
  }),

  knownCase({
    id: 'apigw-lambda-invocation-503',
    description: 'API Gateway non riesce a invocare temporaneamente la Lambda di integrazione (503)',
    priority: 297,
    condition: all(
      apiGwStatusIs('503'),
      { type: 'pattern', ref: 'vars.apiGwErrorMessage', regex: 'Internal server error' },
      stepEvidenceMatches(
        'query-api-gw-execution-logs',
        'Lambda invocation failed with status: 503\\.[\\s\\S]*Lambda request id:',
      ),
    ),
    title: 'API Gateway 503 - Lambda invocation failed',
    resolution: 'Nessuna azione al momento: errore di rete AWS temporaneo.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Execution log', '{{vars.apiGwExecutionLogGroup}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),

  knownCase({
    id: 'apigw-endpoint-timeout-no-delivery-logs',
    description: 'API Gateway 504 per superamento del timeout di integrazione senza errori su pn-delivery',
    priority: 296,
    condition: all(
      apiGwStatusIs('504'),
      { type: 'pattern', ref: 'vars.apiGwErrorMessage', regex: 'Endpoint request timed out' },
      { type: 'compare', ref: 'vars.deliveryLogCount', operator: '==', value: '0' },
    ),
    title: 'API Gateway 504 - Endpoint request timed out',
    resolution: 'Nessuna azione necessaria; API Gateway ha superato il timeout di risposta di circa 29 secondi.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Errore', '{{vars.apiGwErrorMessage}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),

  knownCase({
    id: 'apigw-500-no-application-logs',
    description: 'API Gateway 500 senza errori correlati su pn-delivery o sulla Lambda di versioning',
    priority: 295,
    condition: all(
      apiGwStatusIs('500'),
      { type: 'compare', ref: 'vars.deliveryLogCount', operator: '==', value: '0' },
      { type: 'not', condition: { type: 'exists', ref: 'vars.apiGwErrorMessage' } },
    ),
    title: 'API Gateway 500 senza log applicativi correlati',
    resolution: 'Caso noto documentato nel thread Slack; non sono richieste azioni ulteriori.',
    details: [['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [slackLink(NO_APPLICATION_LOGS_THREAD, 'Thread Slack del caso senza log applicativi')],
    },
  }),

  knownCase({
    id: 'data-vault-selfcarepg-500',
    description: 'SelfcarePG restituisce 500 durante l’inserimento dell’istituzione in pn-data-vault',
    priority: 294,
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=500 Internal Server Error from POST https://api\\.selfcare\\.pagopa\\.it/external/data-vault/v1/pn-pg/institutions/add',
    ),
    title: '[DOWNSTREAM] SelfcarePG - 500 Internal Server Error',
    resolution:
      'Disservizio solitamente temporaneo del downstream Selfcare; se non ricorre nel breve non è necessaria alcuna azione.',
    details: [
      ['Downstream', 'SelfcarePG'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      links: [slackLink(SELFCARE_500_THREAD, 'Thread Slack SelfcarePG 500')],
    },
  }),

  knownCase({
    id: 'data-vault-selfcare-read-timeout',
    description: 'ReadTimeout verso Selfcare durante l’inserimento dell’istituzione in pn-data-vault',
    priority: 293,
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      'WebClientRequestException:[\\s\\S]*ReadTimeoutException[\\s\\S]*Request to POST https://api\\.selfcare\\.pagopa\\.it/external/data-vault/v1/pn-pg/institutions/add',
    ),
    title: '[DOWNSTREAM] Selfcare - ReadTimeout da pn-data-vault',
    resolution: 'Problematica già segnalata al downstream Selfcare; attendere il ripristino.',
    details: [['Errore', '{{vars.dataVaultErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: ['Attendere il ripristino del downstream Selfcare'],
    },
  }),

  knownCase({
    id: 'external-registries-selfcarepg-read-timeout',
    description: 'ReadTimeout del downstream SelfcarePG da pn-external-registries',
    priority: 292,
    condition: EXTERNAL_REGISTRIES_SELFCARE_READ_TIMEOUT,
    title: '[DOWNSTREAM] SelfcarePG - ReadTimeout da pn-external-registries',
    resolution: 'Problematica già segnalata al downstream Selfcare; attendere il ripristino.',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: ['Attendere il ripristino del downstream Selfcare'],
    },
  }),

  knownCase({
    id: 'external-registries-selfcare-retry-timeout',
    description: 'Retry fallito per timeout verso Selfcare da pn-external-registries',
    priority: 291,
    condition: EXTERNAL_REGISTRIES_SELFCARE_RETRY_TIMEOUT,
    title: '[DOWNSTREAM] Selfcare - retry fallito per ReadTimeout',
    resolution: 'Problematica già segnalata al downstream Selfcare; attendere il ripristino.',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: ['Attendere il ripristino del downstream Selfcare'],
    },
  }),

  knownCase({
    id: 'external-registries-connection-aborted',
    description: 'Connessione chiusa prima dell’invio da pn-external-registries',
    priority: 290,
    condition: EXTERNAL_REGISTRIES_CONNECTION_ABORTED,
    title: 'pn-external-registries - Connection Aborted prima dell’invio',
    resolution: 'Evento di rete occasionale; nessuna azione da intraprendere al momento.',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),

  knownCase({
    id: 'data-vault-connection-aborted-after-success',
    description: 'Connessione pn-data-vault chiusa dopo il completamento corretto dell’operazione',
    priority: 289,
    condition: all(
      stepEvidenceMatches(
        'query-pn-data-vault',
        'reactor\\.netty\\.channel\\.AbortedException: Connection has been closed BEFORE send operation',
      ),
      stepEvidenceMatches(
        'query-pn-data-vault',
        'Successful API operation: RecipientsApi\\._getRecipientDenominationByInternalId',
      ),
      stepEvidenceMatches('query-pn-data-vault', 'Ending process _getRecipientDenominationByInternalId'),
    ),
    title: 'pn-data-vault - Connection Aborted dopo operazione riuscita',
    resolution:
      'Evento occasionale successivo a un’operazione conclusa correttamente; nessuna azione da intraprendere.',
    details: [['Errore', '{{vars.dataVaultErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),

  knownCase({
    id: 'delivery-external-registries-read-timeout',
    description: 'pn-delivery non riesce a recuperare i gruppi per timeout verso pn-external-registries',
    priority: 288,
    condition: all(
      stepEvidenceMatches(
        'query-pn-delivery',
        'Error during retrieve of the groups[\\s\\S]*ResourceAccessException:[\\s\\S]*ext-registry-private/pa/v1/groups-all[\\s\\S]*Read timed out',
      ),
      { type: 'exists', ref: 'vars.externalRegistriesLogCount' },
      not(
        any(
          EXTERNAL_REGISTRIES_SELFCARE_READ_TIMEOUT,
          EXTERNAL_REGISTRIES_SELFCARE_RETRY_TIMEOUT,
          EXTERNAL_REGISTRIES_CONNECTION_ABORTED,
        ),
      ),
    ),
    title: 'pn-delivery - timeout verso pn-external-registries',
    resolution: 'Errore di rete noto; segnalare il caso se si protrae nel tempo.',
    details: [['Errore', '{{vars.deliveryErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: ['Monitorare la ricorrenza e segnalare se il timeout si protrae nel tempo'],
    },
  }),

  knownCase({
    id: 'delivery-data-vault-read-timeout',
    description: 'pn-delivery riceve un ReadTimeout chiamando pn-data-vault',
    priority: 287,
    condition: all(
      stepEvidenceMatches(
        'query-pn-delivery',
        'I/O error on POST request for ["\\\\]*http://[^\\s"\\\\]+/datavault-private/v1/recipients/external/PG["\\\\]*:[\\s\\S]*Read timed out',
      ),
      { type: 'exists', ref: 'vars.dataVaultLogCount' },
    ),
    title: 'pn-delivery - ReadTimeout verso pn-data-vault',
    resolution: 'Timeout di rete noto nella chiamata a pn-data-vault; monitorare se ricorrente.',
    details: [['Errore', '{{vars.deliveryErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: ['Monitorare la ricorrenza del timeout verso pn-data-vault'],
    },
  }),
];
