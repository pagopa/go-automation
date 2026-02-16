/**
 * Constants for the pn-address-book-io-IO-ApiGwAlarm runbook.
 */

/** API Gateway AccessLog log group for pn-user-attributes */
export const API_GW_LOG_GROUP =
  'pn-user-attributes-microsvc-prod-AddressBookMicroservicePublicIoAPI-1C6CG6ZRGH1WD-PublicApiLogGroup-bYfVwP3QLlF0';

/** ECS log group for pn-user-attributes */
export const USER_ATTRIBUTES_LOG_GROUP = '/aws/ecs/pn-user-attributes';

/** ECS log group for pn-data-vault */
export const DATA_VAULT_LOG_GROUP = '/aws/ecs/pn-data-vault';

/** ECS log group for pn-external-registries */
export const EXTERNAL_REGISTRIES_LOG_GROUP = '/aws/ecs/pn-external-registries';

/** Lambda log group for pn-ioAuthorizerLambda */
export const IO_AUTHORIZER_LAMBDA_LOG_GROUP = '/aws/lambda/pn-ioAuthorizerLambda';

/** Default time window in minutes (±N from alarm time) */
export const DEFAULT_TIME_WINDOW_MINUTES = 5;

/**
 * Default minimum HTTP status code for filtering API GW errors.
 * Set to 400 to capture both 4xx and 5xx errors from the known cases table.
 */
export const DEFAULT_MIN_STATUS_CODE = 400;

/** Threshold in ms for authorizer latency (Livello 0 check) */
export const AUTHORIZER_LATENCY_THRESHOLD_MS = 5000;

/**
 * Known error pattern definition.
 */
export interface KnownErrorPattern {
  readonly id: string;
  readonly pattern: RegExp;
  readonly microservice: string;
  readonly downstream: string;
  readonly description: string;
  readonly resolution: string;
  readonly task?: string;
}

/**
 * Known error patterns for this runbook.
 * Each pattern is tested against concatenated error messages from service logs.
 *
 * Source: Runbook PDF "GO-pn-address-book-io-IO-ApiGwAlarm" - Tabella Casi Noti
 */
export const KNOWN_ERROR_PATTERNS: ReadonlyArray<KnownErrorPattern> = [
  // ── PDV (Personal Data Vault) ─────────────────────────────────────────
  {
    id: 'pdv-404',
    pattern: /Service PersonalDataVault_Tokenizer returned errors=404 Not Found/,
    microservice: 'pn-data-vault',
    downstream: 'Personal Data Vault (PDV)',
    description: 'Record mancante su PDV (Personal Data Vault)',
    resolution: 'Scenario di errore già noto ed in via di risoluzione sul codice applicativo',
    task: 'PN-15981',
  },

  // ── AppIO 404: Activation not found ───────────────────────────────────
  {
    id: 'appio-activation-not-found',
    pattern: /Service IO returned errors=404 Not Found.*Activation not found for the user/,
    microservice: 'pn-external-registries',
    downstream: 'AppIO',
    description: 'Allarme scattato per un 404 ricevuto da AppIO - Activation not found',
    resolution: 'Chiusura: caso noto',
  },

  // ── AppIO 500: Cosmos DB rate limit (429) ─────────────────────────────
  {
    id: 'appio-cosmos-429',
    pattern:
      /Service IO returned errors=500 Internal Server Error.*Query error \(COSMOS_ERROR_RESPONSE\).*429.*request rate is too large/,
    microservice: 'pn-external-registries',
    downstream: 'AppIO',
    description: 'AppIO Cosmos DB rate limit exceeded (429)',
    resolution: 'Errore transitorio lato AppIO, verificare se ricorrente',
  },

  // ── pn-user-attributes: io-activation-service failed + PDV 404 ───────
  {
    id: 'io-activation-save-failed-pdv',
    pattern: /Saving to io-activation-service failed.*deleting from addressbook appio channeltype/,
    microservice: 'pn-user-attributes',
    downstream: 'N/A',
    description: 'Salvataggio io-activation-service fallito con errore PDV 404',
    resolution: 'Vedi caso 500 su pn-data-vault con messaggio PDV 404',
    task: 'PN-16877',
  },

  // ── pn-user-attributes: io-status activated, re-adding ────────────────
  {
    id: 'io-status-activated-readding',
    pattern: /outcome io-status is activated, re-adding to addressbook appio channeltype/,
    microservice: 'pn-user-attributes',
    downstream: 'N/A',
    description: 'Re-inserimento in addressbook dopo attivazione IO',
    resolution: 'Nessuna azione necessaria',
  },

  // ── 504 Gateway Timeout ───────────────────────────────────────────────
  {
    id: 'gateway-timeout-504',
    pattern: /Gateway Timeout|Endpoint request timed out/,
    microservice: 'pn-address-book-io-public-api-IO-openapi',
    downstream: 'N/A',
    description: 'Gateway Timeout 504: nessun log su pn-user-attributes, errore transitorio',
    resolution: 'Nessuna azione, classificare come transitorio',
  },

  // ── DynamoDB TransactionConflict (400) ────────────────────────────────
  {
    id: 'dynamodb-transaction-conflict',
    pattern: /error saving address book.*AUD_AB_DA_IO_INSUP.*FAILURE.*Transaction cancelled.*TransactionConflict/,
    microservice: 'pn-user-attributes',
    downstream: 'N/A',
    description: 'Errore su transazione DynamoDB - TransactionConflict',
    resolution: 'Errore noto su transazione DynamoDB',
    task: 'PN-17228',
  },

  // ── pn-user-attributes: InternalError / SQS sendMessageBatch ─────────
  {
    id: 'internal-error-sqs',
    pattern:
      /AUD_AB_DA_IO_INSUP.*FAILURE.*failed saving exception=InternalError.*Ending process _setCourtesyAddressIo with errors=Internal Error/,
    microservice: 'pn-user-attributes',
    downstream: 'N/A',
    description: 'Errore interno - probabile problema SQS sendMessageBatch',
    resolution: 'Errore noto al gruppo Infra',
    task: 'PN-16131',
  },

  // ── pn-ioAuthorizerLambda timeout (5000ms) ────────────────────────────
  {
    id: 'io-authorizer-lambda-timeout',
    pattern: /Duration: 5000\.00 ms.*Status: timeout/,
    microservice: 'pn-ioAuthorizerLambda',
    downstream: 'N/A',
    description: 'Superamento 5 secondi lambda pn-ioAuthorizerLambda',
    resolution: 'Nessuna azione se saltuario, verificare se ricorrente',
  },
];
