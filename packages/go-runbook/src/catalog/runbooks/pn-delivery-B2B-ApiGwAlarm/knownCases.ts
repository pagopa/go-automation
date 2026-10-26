import { varEquals, varExists, varMatches } from '../common/varConditions.js';
/**
 * Known cases for the pn-delivery-B2B-ApiGwAlarm runbook.
 */
import { SEND_DOWNSTREAMS, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { all, any, not } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { apiGwPathMatches, apiGwStatusIs } from '../../../apigw/knownCases/conditions.js';
import { VERSIONING_LAMBDA_ERROR_COUNT_VAR, VERSIONING_LAMBDA_PROBE_STATE_VAR } from './versioningLambdaProbe.js';
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
const GENERIC_API_GATEWAY_500 = any(
  not(varExists('apiGwErrorMessage')),
  varEquals('apiGwErrorMessage', '-'),
  varMatches('apiGwErrorMessage', '^Internal server error$'),
);
/**
 * Actionable/manual cases use the 500 range. Automatically closable cases
 * use the 200 range, so a benign overlap can never hide work still required.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'pdv-tokenizer-404-tbd',
    description: 'Personal Data Vault Tokenizer restituisce 404 Not Found',
    priority: 1550,
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      '\\[DOWNSTREAM\\] Service PersonalDataVault_Tokenizer returned errors=404 Not Found',
    ),
    title: '[DOWNSTREAM] PersonalDataVault_Tokenizer - 404 Not Found',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Downstream', 'Personal Data Vault'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.PERSONAL_DATA_VAULT],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'pn-ss-pn-f24-read-forbidden',
    description: 'Il client pn-f24 non ha i privilegi di lettura sul documento Safe Storage',
    priority: 1540,
    condition: stepEvidenceMatches(
      'query-pn-safestorage',
      'Ending process getFile\\(\\) with errors=403 FORBIDDEN[\\s\\S]*Client\\s*:\\s*pn-f24 not has privilege for read document',
    ),
    title: 'Safe Storage 403 - pn-f24 privo dei privilegi di lettura',
    resolution:
      'Verificare che la notifica sia associata all\u2019ente \u201CComune di Monte San Savino\u201D. Vedi link',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.safeStorageErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ss' }],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'pn-f24-safe-storage-metadata-gone',
    description: 'PN-F24 riceve 410 Gone recuperando i metadati F24 da Safe Storage',
    priority: 1530,
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
      'Nei casi documentati la notifica era associata al Comune di Monte San Savino; il mittente \u00E8 verificabile tramite la tabella pn-Notifications nell\u2019account core. Riferimento ai thread indicati nel runbook.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore PN-F24', '{{vars.f24ErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779875991448379',
          name: 'Thread Slack 27/05/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1783422596434969',
          name: 'Thread Slack 07/07/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'delivery-document-index-out-of-bounds',
    description: 'Indice documento fuori dai limiti causa ArrayIndexOutOfBoundsException su pn-delivery',
    priority: 299,
    condition: all(
      apiGwStatusIs('500'),
      apiGwPathMatches('/attachments/documents/-?\\d+$'),
      stepEvidenceMatches(
        'query-pn-delivery',
        'PnInternalException:[\\s\\S]*nested exception is java\\.lang\\.ArrayIndexOutOfBoundsException',
      ),
    ),
    title: 'pn-delivery - indice documento fuori dai limiti',
    resolution: 'Thread Slack 17/08/2026 Bug Produzione: PN-21372',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.deliveryErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1786977695806849',
          name: 'Thread Slack 17/08/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
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
    resolution: 'Thread Slack 28/05/2026 - 1 Thread Slack 28/05/2026 - 2',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.deliveryErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779973763295549',
          name: 'Thread Slack GO 28/05/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1779974451222819',
          name: 'Thread Slack Delivery 28/05/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'apigw-lambda-invocation-503',
    description: 'API Gateway non riesce a invocare temporaneamente la Lambda di integrazione (503)',
    priority: 1297,
    condition: all(
      apiGwStatusIs('503'),
      varMatches('apiGwErrorMessage', 'Internal server error'),
      stepEvidenceMatches(
        'query-api-gw-execution-logs',
        'Lambda invocation failed with status: 503\\.[\\s\\S]*Lambda request id:',
      ),
    ),
    title: 'API Gateway 503 - Lambda invocation failed',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Execution log', '{{vars.apiGwExecutionLogGroup}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'selfcare-tls-hostname-mismatch',
    description: 'Chiamata a Selfcare fallita per certificato TLS non corrispondente all’hostname',
    priority: 1520,
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      'No subject alternative DNS name matching api\\.selfcare\\.pagopa\\.it found',
    ),
    title: 'Selfcare - certificato TLS non valido per api.selfcare.pagopa.it',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'pn-ss-get-file-document-deleted',
    description: 'safe-storage restituisce 410 GONE perché il documento è stato cancellato',
    priority: 1283,
    condition: stepEvidenceMatches('query-pn-f24', 'Ending process getFile\\(\\) with errors=410 GONE'),
    title: 'safe-storage 410 GONE - documento cancellato',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.f24ErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'apigw-waf-rule-evaluation-error',
    description: 'API Gateway 500 per errore di valutazione delle regole AWS WAF',
    priority: 1286,
    condition: all(apiGwStatusIs('500'), varMatches('apiGwErrorMessage', 'error evaluating the AWS WAF rules')),
    title: 'API Gateway 500 - errore di valutazione WAF',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.apiGwErrorMessage}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'apigw-endpoint-network-error',
    description: 'API Gateway 504 per errore di rete nella comunicazione con l’integrazione',
    priority: 1285,
    condition: all(apiGwStatusIs('504'), varMatches('apiGwErrorMessage', 'Network error communicating with endpoint')),
    title: 'API Gateway 504 - Network error communicating with endpoint',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Errore', '{{vars.apiGwErrorMessage}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'apigw-endpoint-timeout-no-delivery-logs',
    description: 'API Gateway 504 per superamento del timeout di integrazione senza errori su pn-delivery',
    priority: 296,
    condition: all(
      apiGwStatusIs('504'),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      varEquals('deliveryLogCount', '0'),
    ),
    title: 'API Gateway 504 - Endpoint request timed out',
    resolution: 'Nessuna azione necessaria.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Errore', '{{vars.apiGwErrorMessage}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'apigw-500-no-application-logs',
    description: 'API Gateway 500 senza errori correlati su pn-delivery o sulla Lambda di versioning',
    priority: 1295,
    condition: all(
      apiGwStatusIs('500'),
      varEquals('deliveryLogCount', '0'),
      {
        type: 'compare',
        ref: `vars.${VERSIONING_LAMBDA_PROBE_STATE_VAR}`,
        operator: '==',
        value: 'queried',
      },
      {
        type: 'compare',
        ref: `vars.${VERSIONING_LAMBDA_ERROR_COUNT_VAR}`,
        operator: '==',
        value: '0',
      },
      GENERIC_API_GATEWAY_500,
    ),
    title: 'API Gateway 500 senza log applicativi correlati',
    resolution: 'Riferimento al thread Slack indicato nella pagina; non \u00E8 documentata una risoluzione.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Verifica Lambda versioning', '{{vars.versioningLambdaProbeState}}'],
      ['Errori Lambda versioning', '{{vars.versioningLambdaErrorCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1771856191424399',
          name: 'Thread Slack del caso senza log applicativi',
          type: 'SLACK',
        },
      ],
      finalActions: [],
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
      'Solitamente causato da un disservizio temporaneo. Se non si riverifica nel breve \u00E8 possibile ignorarlo https://pagopaspa.slack.com/archives/C087KRMD16E/p1763476967853039',
    details: [
      ['Downstream', 'SelfcarePG'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1763476967853039',
          name: 'Thread Slack SelfcarePG 500',
          type: 'SLACK',
        },
      ],
      finalActions: [],
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
    resolution: 'Problematica segnalata gi\u00E0 da tempo al downstream coinvolto.',
    details: [['Errore', '{{vars.dataVaultErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'external-registries-selfcarepg-read-timeout',
    description: 'ReadTimeout del downstream SelfcarePG da pn-external-registries',
    priority: 292,
    condition: EXTERNAL_REGISTRIES_SELFCARE_READ_TIMEOUT,
    title: '[DOWNSTREAM] SelfcarePG - ReadTimeout da pn-external-registries',
    resolution: 'Problematica segnalata gi\u00E0 da tempo al downstream coinvolto.',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'external-registries-selfcare-retry-timeout',
    description: 'Retry fallito per timeout verso Selfcare da pn-external-registries',
    priority: 291,
    condition: EXTERNAL_REGISTRIES_SELFCARE_RETRY_TIMEOUT,
    title: '[DOWNSTREAM] Selfcare - retry fallito per ReadTimeout',
    resolution: 'Problematica segnalata gi\u00E0 da tempo al downstream coinvolto.',
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'external-registries-connection-aborted',
    description: 'Connessione chiusa prima dell’invio da pn-external-registries',
    priority: 290,
    condition: EXTERNAL_REGISTRIES_CONNECTION_ABORTED,
    title: 'pn-external-registries - Connection Aborted prima dell’invio',
    resolution: "Trattandosi di un\u2019evento occasionale non c'\u00E8 nessuna azione da intraprendere.",
    details: [['Errore', '{{vars.externalRegistriesErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'data-vault-connection-aborted-after-success',
    description: 'Connessione pn-data-vault chiusa dopo il completamento corretto dell’operazione',
    priority: 1289,
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
    resolution: 'Risoluzione non documentata.',
    details: [['Errore', '{{vars.dataVaultErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
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
      varExists('externalRegistriesLogCount'),
      not(
        any(
          EXTERNAL_REGISTRIES_SELFCARE_READ_TIMEOUT,
          EXTERNAL_REGISTRIES_SELFCARE_RETRY_TIMEOUT,
          EXTERNAL_REGISTRIES_CONNECTION_ABORTED,
        ),
      ),
    ),
    title: 'pn-delivery - timeout verso pn-external-registries',
    resolution: 'Da segnalare se si protrae nel tempo.',
    details: [['Errore', '{{vars.deliveryErrorMsg}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'delivery-data-vault-read-timeout',
    description: 'pn-delivery riceve un ReadTimeout chiamando pn-data-vault',
    priority: 1287,
    condition: all(
      stepEvidenceMatches(
        'query-pn-delivery',
        'I/O error on POST request for ["\\\\]*http://[^\\s"\\\\]+/datavault-private/v1/recipients/external/PG["\\\\]*:[\\s\\S]*Read timed out',
      ),
      varExists('dataVaultLogCount'),
    ),
    title: 'pn-delivery - ReadTimeout verso pn-data-vault',
    resolution: 'Risoluzione non documentata.',
    details: [['Errore', '{{vars.deliveryErrorMsg}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
