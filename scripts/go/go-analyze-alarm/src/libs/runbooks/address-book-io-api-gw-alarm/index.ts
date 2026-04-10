/**
 * Runbook: pn-address-book-io-IO-ApiGwAlarm
 *
 * Analyzes API Gateway alarms for the pn-user-attributes microservice.
 * Performs a multi-level investigation through the service chain:
 *
 * 0. (Livello 0) Check authorizerLatency > 5000ms at API GW level,
 *    query pn-ioAuthorizerLambda logs for timeout evidence
 * 1. Query API Gateway AccessLog for HTTP errors (>= 400)
 * 2. Extract xRayTraceId and analyze pn-user-attributes logs
 * 3. Analyze pn-data-vault logs (with continueOnFailure)
 * 4. Analyze pn-external-registries logs (with continueOnFailure)
 * 5. Match known error patterns and determine resolution
 *
 * Microservices: pn-user-attributes, pn-data-vault, pn-external-registries
 * Downstream: AppIO, Personal Data Vault (PDV)
 *
 */

import * as Runbook from '@go-automation/go-runbook';

import {
  API_GW_LOG_GROUP,
  USER_ATTRIBUTES_LOG_GROUP,
  DATA_VAULT_LOG_GROUP,
  EXTERNAL_REGISTRIES_LOG_GROUP,
  IO_AUTHORIZER_LAMBDA_LOG_GROUP,
  DEFAULT_MIN_STATUS_CODE,
} from './constants.js';
import { parseApiGwErrors } from './steps/ParseApiGwErrorsStep.js';
import { analyzeServiceLogs } from './steps/AnalyzeServiceLogsStep.js';

/**
 * Builds the pn-address-book-io-IO-ApiGwAlarm runbook definition.
 *
 * @returns A validated Runbook ready for execution
 */
export function buildAddressBookIoApiGwAlarmRunbook(): Runbook.Runbook {
  return (
    Runbook.RunbookBuilder.create('pn-address-book-io-IO-ApiGwAlarm')
      .metadata({
        name: 'ANALISI ALLARME pn-address-book-io-IO-ApiGwAlarm',
        description: 'Analizza gli allarmi API Gateway del microservizio pn-user-attributes',
        version: '2.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: ['api-gateway', 'pn-user-attributes', 'pn-data-vault', 'pn-external-registries', 'pn-ioAuthorizerLambda'],
      })

      // ── Step 1: Query API Gateway AccessLog ──────────────────────────────
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-api-gw-logs',
          label: 'Query API Gateway AccessLog per errori HTTP',
          logGroups: [API_GW_LOG_GROUP],
          query: `
          fields @timestamp, @message, @log, status, cxId, xrayTraceId, authorizerLatency
          | sort @timestamp asc
          | limit 10000
          | filter status >= '${DEFAULT_MIN_STATUS_CODE}'
        `,
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
      )

      // ── Step 2: Parse API GW results ─────────────────────────────────────
      // Extracts error count, xRayTraceId, status code.
      // Returns 'stop' if no errors found.
      .step(
        parseApiGwErrors({
          id: 'parse-api-gw-errors',
          label: 'Analisi errori API Gateway',
          fromStep: 'query-api-gw-logs',
          minStatusCode: DEFAULT_MIN_STATUS_CODE,
        }),
      )

      // ── Step 3: Query pn-ioAuthorizerLambda logs (Livello 0) ─────────────
      // Checks for lambda timeout evidence when authorizerLatency > 5000ms
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-io-authorizer-lambda',
          label: 'Query log pn-ioAuthorizerLambda (Livello 0)',
          logGroups: [IO_AUTHORIZER_LAMBDA_LOG_GROUP],
          query: `
          fields @timestamp, @message, @duration, @billedDuration
          | filter @message like 'REPORT'
          | filter @duration >= 5000
          | sort @timestamp desc
          | limit 100
        `,
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
        { continueOnFailure: true },
      )

      // ── Step 4: Analyze pn-ioAuthorizerLambda logs ───────────────────────
      .step(
        analyzeServiceLogs({
          id: 'analyze-io-authorizer-lambda',
          label: 'Analisi log pn-ioAuthorizerLambda',
          fromStep: 'query-io-authorizer-lambda',
          varPrefix: 'ioAuthorizerLambda',
        }),
        { continueOnFailure: true },
      )

      // ── Step 5: Query pn-user-attributes logs ────────────────────────────
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-user-attributes',
          label: 'Query log pn-user-attributes con xRayTraceId',
          logGroups: [USER_ATTRIBUTES_LOG_GROUP],
          query: `
          fields @timestamp, level, message, @message, @log, \`AWS-XRAY-TRACE-ID\`, trace_id, cx_id
          | sort @timestamp asc
          | limit 10000
          | filter (trace_id like '{{vars.xRayTraceId}}' OR \`AWS-XRAY-TRACE-ID\` like '{{vars.xRayTraceId}}')
        `,
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
      )

      // ── Step 6: Analyze pn-user-attributes logs ──────────────────────────
      .step(
        analyzeServiceLogs({
          id: 'analyze-user-attributes',
          label: 'Analisi log pn-user-attributes',
          fromStep: 'query-user-attributes',
          varPrefix: 'userAttributes',
          detectNextService: true,
        }),
      )

      // ── Step 7: Query pn-data-vault logs ─────────────────────────────────
      // Uses continueOnFailure because the trace might not reach this service.
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-data-vault',
          label: 'Query log pn-data-vault',
          logGroups: [DATA_VAULT_LOG_GROUP],
          query: `
          fields @timestamp, @message, trace_id, level
          | filter @message like '{{vars.xRayTraceId}}'
          | sort @timestamp desc
          | limit 1000
        `,
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
        { continueOnFailure: true },
      )

      // ── Step 8: Analyze pn-data-vault logs ───────────────────────────────
      .step(
        analyzeServiceLogs({
          id: 'analyze-data-vault',
          label: 'Analisi log pn-data-vault',
          fromStep: 'query-data-vault',
          varPrefix: 'dataVault',
          detectNextService: true,
        }),
        { continueOnFailure: true },
      )

      // ── Step 9: Query pn-external-registries logs ────────────────────────
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-external-registries',
          label: 'Query log pn-external-registries',
          logGroups: [EXTERNAL_REGISTRIES_LOG_GROUP],
          query: `
          fields @timestamp, @message, trace_id, level
          | filter @message like '{{vars.xRayTraceId}}'
          | sort @timestamp desc
          | limit 1000
        `,
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
        { continueOnFailure: true },
      )

      // ── Step 10: Analyze pn-external-registries logs ─────────────────────
      .step(
        analyzeServiceLogs({
          id: 'analyze-external-registries',
          label: 'Analisi log pn-external-registries',
          fromStep: 'query-external-registries',
          varPrefix: 'externalRegistries',
        }),
        { continueOnFailure: true },
      )

      // ══════════════════════════════════════════════════════════════════════
      // ── Known Cases  ─────────────────
      // ══════════════════════════════════════════════════════════════════════

      // ── Livello 0: pn-ioAuthorizerLambda timeout (5000ms) ───────────────
      .knownCase({
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
      })

      // ── 504 Gateway Timeout / Endpoint request timed out ────────────────
      .knownCase({
        id: 'gateway-timeout-504',
        description: 'Gateway Timeout 504 - errore transitorio',
        priority: 105,
        condition: {
          type: 'or',
          conditions: [
            {
              type: 'compare',
              ref: 'vars.apiGwStatusCode',
              operator: '==',
              value: '504',
            },
            {
              type: 'pattern',
              ref: 'vars.userAttributesErrorMsg',
              regex: 'Endpoint request timed out',
            },
          ],
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] Gateway Timeout 504 - Nessun log su pn-user-attributes, errore transitorio\n' +
            'Risoluzione: Nessuna azione, classificare come transitorio\n' +
            'Status Code: {{vars.apiGwStatusCode}}',
        },
      })

      // ── PDV 404: Record mancante su Personal Data Vault ─────────────────
      .knownCase({
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
      })

      // ── AppIO 404: Activation not found ─────────────────────────────────
      .knownCase({
        id: 'appio-activation-not-found',
        description: 'Allarme scattato per un 404 ricevuto da AppIO - Activation not found',
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
              regex:
                'Service IO returned errors=404 Not Found from POST.*activations.*Activation not found for the user',
            },
          ],
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] 404 da AppIO - Activation not found for the user\n' +
            'Risoluzione: Chiusura - caso noto\n' +
            'Errore: {{vars.externalRegistriesErrorMsg}}',
        },
      })

      // ── AppIO 500: Cosmos DB rate limit (429) ───────────────────────────
      .knownCase({
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
      })

      // ── io-activation-service failed + PDV 404 ─────────────────────────
      .knownCase({
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
      })

      // ── io-status activated, re-adding to addressbook ───────────────────
      .knownCase({
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
      })

      // ── DynamoDB TransactionConflict (400) ──────────────────────────────
      .knownCase({
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
      })

      // ── InternalError / SQS sendMessageBatch ────────────────────────────
      .knownCase({
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
      })

      // ── Fallback ─────────────────────────────────────────────────────────
      .fallback({
        type: 'log',
        level: 'warn',
        message:
          "[CASO NON RICONOSCIUTO] Impossibile identificare univocamente la causa dell'errore.\n" +
          'Errori API GW: {{vars.apiGwErrorCount}}\n' +
          'Status Code: {{vars.apiGwStatusCode}}\n' +
          'IO Authorizer Lambda: {{vars.ioAuthorizerLambdaErrorMsg}}\n' +
          'User Attributes: {{vars.userAttributesErrorMsg}}\n' +
          'Data Vault: {{vars.dataVaultErrorMsg}}\n' +
          'External Registries: {{vars.externalRegistriesErrorMsg}}',
      })

      .build()
  );
}
