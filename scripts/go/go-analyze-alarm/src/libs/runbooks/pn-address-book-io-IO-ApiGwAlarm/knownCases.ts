/**
 * Known cases for the pn-address-book-io-IO-ApiGwAlarm runbook.
 */

import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  // ── Livello 0: pn-ioAuthorizerLambda — invocation failure ─────────────
  // L'API GW Access log mostra status=500, l'authorizer è stato invocato
  // (`authorizerRequestId != '-'`) ma l'invocazione lambda è fallita
  // prima di completare; di conseguenza il backend non è mai stato
  // raggiunto (`integrationRequestId == '-'`) e i log applicativi di
  // pn-user-attributes sono vuoti.
  // Tipici dettagli (visibili solo nell'API Gateway Execution log):
  // `Lambda invocation failed with status: 503` oppure una timeout
  // dell'authorizer rilevata dall'API GW. Distinto dal caso
  // `io-authorizer-lambda-timeout` (priority 110) che si attiva solo
  // quando trovi un REPORT con `Status: timeout` sui log della lambda
  // stessa.
  //
  // NOTA: non vincoliamo `apiGwErrorMessage` perché può presentarsi sia
  // come `Internal server error` sia come `-` a seconda del momento in
  // cui API GW chiude la response.
  {
    id: 'io-authorizer-lambda-invocation-failure',
    description: 'Fallimento invocazione lambda pn-ioAuthorizerLambda',
    priority: 108,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '500' },
        { type: 'compare', ref: 'vars.apiGwAuthorizerRequestId', operator: '!=', value: '-' },
        { type: 'compare', ref: 'vars.apiGwIntegrationRequestId', operator: '==', value: '-' },
        { type: 'compare', ref: 'vars.userAttributesLogCount', operator: '==', value: '0' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Fallimento invocazione lambda pn-ioAuthorizerLambda (Lambda 503)\n' +
        'Risoluzione: Nessuna azione se saltuario. Per il dettaglio (es. `Lambda invocation failed with status: 503`) ' +
        "consultare l'API Gateway Execution log.\n" +
        'apiGw requestId: {{vars.apiGwRequestId}}\n' +
        'authorizer requestId: {{vars.apiGwAuthorizerRequestId}}',
    },
  },

  // ── Livello 0: pn-ioAuthorizerLambda timeout (5000ms) ──────────────────
  {
    id: 'io-authorizer-lambda-timeout',
    description: 'Superamento 5 secondi lambda pn-ioAuthorizerLambda',
    priority: 110,
    condition: {
      type: 'pattern',
      ref: 'vars.ioAuthorizerLambdaErrorMsg',
      regex: 'Duration: 5000\\.00 ms.*Status: timeout',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Superamento 5 secondi lambda pn-ioAuthorizerLambda\n' +
        'Risoluzione: Nessuna azione se saltuario, verificare se ricorrente\n' +
        'Errore: {{vars.ioAuthorizerLambdaErrorMsg}}',
    },
  },

  // ── Gateway Timeout 504 senza log applicativi su pn-user-attributes ────
  // V02 §5.4: irrigidito ad AND status==504 + userAttributesLogCount==0.
  {
    id: 'gateway-timeout-504',
    description: 'Gateway Timeout 504 senza log applicativi su pn-user-attributes',
    priority: 105,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '504' },
        { type: 'compare', ref: 'vars.userAttributesLogCount', operator: '==', value: '0' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Gateway Timeout 504 senza log applicativi su pn-user-attributes\n' +
        'Risoluzione: Nessuna azione possibile, classificare come transitorio.\n' +
        'Status Code: {{vars.apiGwStatusCode}}',
    },
  },

  // ── API GW Endpoint request timed out (500) senza log applicativi ──────
  // L'API GW chiude la richiesta in timeout verso l'integrazione (il
  // backend non risponde entro il limite, tipicamente 29s) e produce un
  // `Endpoint request timed out` con status=500 nel proprio AccessLog.
  // pn-user-attributes non logga nulla perché la chiamata viene tagliata
  // a monte. Distinto dal `gateway-timeout-504` perché qui lo status è
  // 500 e la causa è il timeout di integrazione lato API Gateway.
  {
    id: 'apigw-endpoint-timeout-no-logs',
    description: 'API GW endpoint timeout senza log applicativi su pn-user-attributes',
    priority: 103,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '500' },
        { type: 'compare', ref: 'vars.userAttributesLogCount', operator: '==', value: '0' },
        { type: 'pattern', ref: 'vars.apiGwErrorMessage', regex: 'Endpoint request timed out' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] API GW endpoint timeout senza log applicativi su pn-user-attributes\n' +
        "Risoluzione: Nessuna azione possibile, classificare come transitorio. Se ricorrente, verificare la latenza dell'integrazione lato API Gateway.\n" +
        'Endpoint: {{vars.apiGwHttpMethod}} {{vars.apiGwPath}}\n' +
        'Status Code: {{vars.apiGwStatusCode}}\n' +
        'Error: {{vars.apiGwErrorMessage}}',
    },
  },

  // ── PDV 404: Record mancante su Personal Data Vault ────────────────────
  {
    id: 'pdv-404',
    description: 'Record mancante su PDV (Personal Data Vault)',
    priority: 100,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'pattern',
          ref: 'vars.userAttributesErrorMsg',
          regex: 'Service PersonalDataVault_Tokenizer returned errors=404 Not Found',
        },
        {
          type: 'pattern',
          ref: 'vars.dataVaultErrorMsg',
          regex: 'Service PersonalDataVault_Tokenizer returned errors=404 Not Found',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Record mancante su PDV (Personal Data Vault)\n' +
        'Risoluzione: Scenario di errore già noto ed in via di risoluzione sul codice applicativo\n' +
        'Task JIRA: PN-15981\n' +
        'Errore: {{vars.userAttributesErrorMsg}}',
    },
  },

  {
    id: 'appio-downstream-500',
    description: 'Allarme scattato per un 500 ricevuto da AppIO - Internal Server Error',
    priority: 89,
    // Scansiona TUTTI i row dei log di pn-external-registries (non solo
    // il messaggio rappresentativo in `externalRegistriesErrorMsg`).
    // Il caso matcha sia POST sia PUT e l'enumerazione completa delle
    // righe matchate finisce nel trace via `contains.regex`.
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-external-registries',
      regex: '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from (POST|PUT)',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] 500 da AppIO - Internal Server Error\n' +
        'Risoluzione: Chiusura - caso noto\n' +
        'Downstream: AppIO\n',
    },
  },

  // ── AppIO 404: Activation not found ────────────────────────────────────
  {
    id: 'appio-activation-not-found',
    description: 'Allarme scattato per un 404 ricevuto da AppIO - Activation not found for the user',
    priority: 90,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'pattern',
          ref: 'vars.externalRegistriesErrorMsg',
          regex: 'Service IO returned errors=404 Not Found.*Activation not found for the user',
        },
        {
          type: 'pattern',
          ref: 'vars.externalRegistriesErrorMsg',
          regex: 'Service IO returned errors=404 Not Found from POST.*activations.*Activation not found for the user',
        },
        {
          type: 'pattern',
          ref: 'vars.externalRegistriesErrorMsg',
          regex: '404 Not Found from POST https://api\\.io\\.pagopa\\.it/api/v1/activations',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] 404 da AppIO - Activation not found for the user\n' +
        'Risoluzione: Chiusura - caso noto\n' +
        'Downstream: AppIO\n',
    },
  },

  // ── AppIO 500: Cosmos DB rate limit (429) ──────────────────────────────
  {
    id: 'appio-cosmos-429',
    description: 'AppIO Cosmos DB rate limit exceeded (429)',
    priority: 85,
    condition: {
      type: 'pattern',
      ref: 'vars.externalRegistriesErrorMsg',
      regex:
        'Service IO returned errors=500 Internal Server Error.*COSMOS_ERROR_RESPONSE.*429.*request rate is too large',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] AppIO Cosmos DB rate limit exceeded (429)\n' +
        'Risoluzione: Errore transitorio lato AppIO, verificare se ricorrente\n' +
        'Errore: {{vars.externalRegistriesErrorMsg}}',
    },
  },

  // ── io-activation-service failed + PDV 404 ─────────────────────────────
  {
    id: 'io-activation-save-failed-pdv',
    description: 'Salvataggio io-activation-service fallito (PDV 404)',
    priority: 80,
    condition: {
      type: 'pattern',
      ref: 'vars.userAttributesErrorMsg',
      regex: 'Saving to io-activation-service failed.*deleting from addressbook appio channeltype',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Salvataggio io-activation-service fallito con errore PDV 404\n' +
        'Risoluzione: Vedi caso 500 su pn-data-vault con messaggio PDV 404\n' +
        'Task JIRA: PN-16877\n' +
        'Errore: {{vars.userAttributesErrorMsg}}',
    },
  },

  // ── io-status activated, re-adding to addressbook ──────────────────────
  {
    id: 'io-status-activated-readding',
    description: 'Re-inserimento in addressbook dopo attivazione IO',
    priority: 75,
    condition: {
      type: 'pattern',
      ref: 'vars.userAttributesErrorMsg',
      regex: 'outcome io-status is activated, re-adding to addressbook appio channeltype',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Re-inserimento in addressbook dopo attivazione IO\n' +
        'Risoluzione: Nessuna azione necessaria\n' +
        'Errore: {{vars.userAttributesErrorMsg}}',
    },
  },

  // ── DynamoDB TransactionConflict (400) ─────────────────────────────────
  {
    id: 'dynamodb-transaction-conflict',
    description: 'Errore su transazione DynamoDB - TransactionConflict',
    priority: 70,
    condition: {
      type: 'pattern',
      ref: 'vars.userAttributesErrorMsg',
      regex: 'AUD_AB_DA_IO_INSUP.*FAILURE.*Transaction cancelled.*TransactionConflict',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Errore su transazione DynamoDB - TransactionConflict\n' +
        'Risoluzione: Errore noto su transazione DynamoDB\n' +
        'Task JIRA: PN-17228\n' +
        'Errore: {{vars.userAttributesErrorMsg}}',
    },
  },

  // ── InternalError / SQS sendMessageBatch ───────────────────────────────
  {
    id: 'internal-error-sqs',
    description: 'Errore interno - probabile problema SQS sendMessageBatch',
    priority: 65,
    condition: {
      type: 'pattern',
      ref: 'vars.userAttributesErrorMsg',
      regex: 'AUD_AB_DA_IO_INSUP.*FAILURE.*failed saving exception=InternalError',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Errore interno - probabile problema SQS sendMessageBatch\n' +
        'Risoluzione: Errore noto al gruppo Infra\n' +
        'Task JIRA: PN-16131\n' +
        'Errore: {{vars.userAttributesErrorMsg}}',
    },
  },

  // ── Errore generico 500 da pn-external-registries via ext-registry-private ──
  // pn-user-attributes propaga la risposta `500 Internal Server Error` dal
  // downstream interno `ext-registry-private/io/v1/activations`. Il body
  // include `PN_GENERIC_ERROR` e l'indicazione esplicita
  // `See logs for details in PN-EXTERNAL-REGISTRIES`, oltre al
  // `FALLBACK-UUID` da usare per cercare il dettaglio nei log del
  // microservizio downstream.
  //
  // Distinto dal caso #11 (`ext-registry-private-readtimeout`) perché la
  // causa qui non è un timeout di rete ma un errore applicativo lato
  // pn-external-registries (e va indagato sui suoi log).

  // ── #11 NUOVO: ReadTimeout su ext-registry-private ─────────────────────
  // Il campo `error_message` del JSON canonico recita
  //   "error upserting service activation message=...ReadTimeoutException",
  // ma in produzione il messaggio del log che vince per lunghezza in
  // `findErrorMessage` è in realtà
  //   "[AUD_AB_DA_IO_INSUP] FAILURE - failed saving exception=...ReadTimeoutException".
  // Le due varianti sono lo stesso scenario (timeout di rete chiamando
  // ext-registry-private); copriamo entrambe le firme per robustezza.
  {
    id: 'ext-registry-private-readtimeout',
    description: 'ReadTimeout su ext-registry-private da pn-user-attributes',
    priority: 60,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'pattern',
          ref: 'vars.userAttributesErrorMsg',
          regex: 'AUD_AB_DA_IO_INSUP.*ReadTimeoutException',
        },
        {
          type: 'pattern',
          ref: 'vars.userAttributesErrorMsg',
          regex: 'error upserting service activation message=.*ReadTimeoutException',
        },
        {
          type: 'pattern',
          ref: 'vars.userAttributesErrorMsg',
          regex: '_setCourtesyAddressIo.*ReadTimeoutException',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] ReadTimeout di rete su ext-registry-private da pn-user-attributes\n' +
        'Risoluzione: NA - monitorare se ricorrente.\n' +
        'Errore: {{vars.userAttributesErrorMsg}}',
    },
  },
];
