import {
  all,
  any,
  anyStepEvidenceMatches,
  exclusionVar,
  type KnownError,
  not,
  stepEvidenceMatches,
  varEquals,
  varExists,
  varMatches,
} from '../../../../engine/index.js';
import {
  downstreamMarkerPattern,
  apiGwPathMatches,
  apiGwStatusIs,
  knownError,
  SEND_DOWNSTREAMS,
} from '../../../../toolkits/send/index.js';
/**
 * Known errors for the pn-delivery-B2B-ApiGwAlarm runbook.
 */

import { VERSIONING_LAMBDA_ERROR_COUNT_VAR, VERSIONING_LAMBDA_PROBE_STATE_VAR } from './versioningLambdaProbe.js';
import {
  EXTERNAL_REGISTRIES_CONNECTION_ABORTED,
  EXTERNAL_REGISTRIES_SELFCARE_READ_TIMEOUT,
  EXTERNAL_REGISTRIES_SELFCARE_RETRY_TIMEOUT,
} from './externalRegistriesDiagnoses.js';
const GENERIC_API_GATEWAY_500 = any(
  not(varExists('apiGwErrorMessage')),
  varEquals('apiGwErrorMessage', '-'),
  varMatches('apiGwErrorMessage', '^Internal server error$'),
);
/**
 * Actionable/manual cases use the 500 range. Automatically closable cases
 * use the 200 range, so a benign overlap can never hide work still required.
 */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_PDV-TOK-404-TBD',
    description: 'Personal Data Vault Tokenizer restituisce 404 Not Found',
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      downstreamMarkerPattern('PersonalDataVault_Tokenizer', { status: '404 Not Found' }),
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_PN-SS-PN-F24-REA-FOR',
    description: 'Il client pn-f24 non ha i privilegi di lettura sul documento Safe Storage',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_PN-F24-SAF-STO-MET-GON',
    description: 'PN-F24 riceve 410 Gone recuperando i metadati F24 da Safe Storage',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_DEL-DOC-IND-OUT-OF-BOU',
    description: 'Indice documento fuori dai limiti causa ArrayIndexOutOfBoundsException su pn-delivery',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_DEL-MIS-PAY-ATT-IND',
    description: 'Notifica priva dell’indice dell’allegato di pagamento richiesto',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_API-LAM-INV-503',
    description: 'API Gateway non riesce a invocare temporaneamente la Lambda di integrazione (503)',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_SEL-TLS-HOS-MIS',
    description: 'Chiamata a Selfcare fallita per certificato TLS non corrispondente all’hostname',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_PN-SS-GET-FIL-DOC-DEL',
    description: 'safe-storage restituisce 410 GONE perché il documento è stato cancellato',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_API-WAF-RUL-EVA-ERR',
    description: 'API Gateway 500 per errore di valutazione delle regole AWS WAF',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_API-END-NET-ERR',
    description: 'API Gateway 504 per errore di rete nella comunicazione con l’integrazione',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_API-END-TIM-NO-DEL-LOG',
    description: 'API Gateway 504 per superamento del timeout di integrazione senza errori su pn-delivery',
    condition: all(
      apiGwStatusIs('504'),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      varEquals('deliveryLookupState', 'queried'),
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_API-500-NO-APP-LOG',
    description: 'API Gateway 500 senza errori correlati su pn-delivery o sulla Lambda di versioning',
    condition: all(
      apiGwStatusIs('500'),
      varEquals('deliveryLookupState', 'queried'),
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_DAT-VAU-SEL-500',
    description: 'SelfcarePG restituisce 500 durante l’inserimento dell’istituzione in pn-data-vault',
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      downstreamMarkerPattern('SelfcarePG', {
        status: '500 Internal Server Error',
        method: 'POST',
        endpoint: 'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add',
      }),
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_DAT-VAU-SEL-REA-TIM',
    description: 'ReadTimeout verso Selfcare durante l’inserimento dell’istituzione in pn-data-vault',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_EXT-REG-SEL-REA-TIM',
    description: 'ReadTimeout del downstream SelfcarePG da pn-external-registries',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_EXT-REG-SEL-RET-TIM',
    description: 'Retry fallito per timeout verso Selfcare da pn-external-registries',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_EXT-REG-CON-ABO',
    description: 'Connessione chiusa prima dell’invio da pn-external-registries',
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_DAT-VAU-CON-ABO-AFT-SUC',
    description: 'Connessione pn-data-vault chiusa dopo il completamento corretto dell’operazione',
    condition: all(
      stepEvidenceMatches(
        'query-pn-data-vault',
        'reactor\\.netty\\.channel\\.AbortedException: Connection has been closed BEFORE send operation',
      ),
      // The successful operation and its completion are related rows of the same request, not errors.
      anyStepEvidenceMatches(
        ['query-pn-data-vault', 'query-pn-data-vault.context'],
        'Successful API operation: RecipientsApi\\._getRecipientDenominationByInternalId',
      ),
      anyStepEvidenceMatches(
        ['query-pn-data-vault', 'query-pn-data-vault.context'],
        'Ending process _getRecipientDenominationByInternalId',
      ),
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_DEL-EXT-REG-REA-TIM',
    description: 'pn-delivery non riesce a recuperare i gruppi per timeout verso pn-external-registries',
    condition: all(
      stepEvidenceMatches(
        'query-pn-delivery',
        'Error during retrieve of the groups[\\s\\S]*ResourceAccessException:[\\s\\S]*ext-registry-private/pa/v1/groups-all[\\s\\S]*Read timed out',
      ),
      // The complete read of pn-external-registries for this error has no more specific diagnosis.
      varEquals(exclusionVar('externalRegistries', 'specificDiagnosis'), 'absent'),
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
  knownError({
    code: 'SEND_APIGW_PDB2BAGA_DEL-DAT-VAU-REA-TIM',
    description: 'pn-delivery riceve un ReadTimeout chiamando pn-data-vault',
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
