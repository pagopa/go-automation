/**
 * Runbook: pn-delivery-B2B-ApiGwAlarm
 *
 * Analyzes API Gateway alarms for the pn-delivery microservice (B2B channel).
 * Performs a multi-level investigation through the service chain:
 *
 * 0. (Livello 0) Query API GW AccessLog for HTTP errors (>= 400),
 *    extract xRayTraceId from the first error
 * 1. (Livello 1) Query pn-delivery logs with xRayTraceId, detect next service
 * 2. (Livello 2.1) Query pn-external-registries logs (with continueOnFailure)
 * 3. (Livello 2.2) Query pn-data-vault logs (with continueOnFailure)
 * 4. (Livello 3) Query pn-ss logs (with continueOnFailure)
 * 5. Match known error patterns and determine resolution
 *
 * Microservices: pn-delivery, pn-external-registries, pn-data-vault, pn-ss
 * Downstream: Selfcare, pn-external-registry
 */

import * as Runbook from '@go-automation/go-runbook';

import {
  API_GW_LOG_GROUP,
  DELIVERY_LOG_GROUP,
  EXTERNAL_REGISTRIES_LOG_GROUP,
  DATA_VAULT_LOG_GROUP,
  SS_LOG_GROUP,
  DEFAULT_MIN_STATUS_CODE,
} from './constants.js';
import { parseApiGwErrors } from '../address-book-io-api-gw-alarm/steps/ParseApiGwErrorsStep.js';
import { analyzeServiceLogs } from '../address-book-io-api-gw-alarm/steps/AnalyzeServiceLogsStep.js';

/**
 * Builds the pn-delivery-B2B-ApiGwAlarm runbook definition.
 *
 * @returns A validated Runbook ready for execution
 */
export function buildDeliveryB2BApiGwAlarmRunbook(): Runbook.Runbook {
  return (
    Runbook.RunbookBuilder.create('pn-delivery-B2B-ApiGwAlarm')
      .metadata({
        name: 'ANALISI ALLARME pn-delivery-B2B-ApiGwAlarm',
        description: 'Analizza gli allarmi API Gateway del microservizio pn-delivery (canale B2B)',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: ['api-gateway', 'pn-delivery', 'pn-external-registries', 'pn-data-vault', 'pn-ss', 'selfcare'],
      })

      // ── Step 1: Query API Gateway AccessLog (Livello 0) ──────────────────
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-api-gw-logs',
          label: 'Query API Gateway AccessLog per errori HTTP',
          logGroups: [API_GW_LOG_GROUP],
          query: `
          fields @timestamp, @message, @log, status, cxId, xrayTraceId
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

      // ── Step 3: Query pn-delivery logs (Livello 1) ───────────────────────
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-delivery',
          label: 'Query log pn-delivery con xRayTraceId',
          logGroups: [DELIVERY_LOG_GROUP],
          query: `
          fields @timestamp, level, message, @message, @log, \`AWS-XRAY-TRACE-ID\`, trace_id, cx_id
          | sort @timestamp asc
          | limit 10000
          | filter (trace_id like '{{vars.xRayTraceId}}' OR \`AWS-XRAY-TRACE-ID\` like '{{vars.xRayTraceId}}')
        `,
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
      )

      // ── Step 4: Analyze pn-delivery logs ─────────────────────────────────
      // detectNextService extracts the next downstream service trace ID
      // (e.g. "Invoking external service pn-external-registries").
      .step(
        analyzeServiceLogs({
          id: 'analyze-delivery',
          label: 'Analisi log pn-delivery',
          fromStep: 'query-delivery',
          varPrefix: 'delivery',
          detectNextService: true,
        }),
      )

      // ── Step 5: Query pn-external-registries logs (Livello 2.1) ──────────
      // Uses continueOnFailure because the trace might not reach this service.
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-external-registries',
          label: 'Query log pn-external-registries (Livello 2.1)',
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

      // ── Step 6: Analyze pn-external-registries logs ───────────────────────
      .step(
        analyzeServiceLogs({
          id: 'analyze-external-registries',
          label: 'Analisi log pn-external-registries',
          fromStep: 'query-external-registries',
          varPrefix: 'externalRegistries',
        }),
        { continueOnFailure: true },
      )

      // ── Step 7: Query pn-data-vault logs (Livello 2.2) ───────────────────
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-data-vault',
          label: 'Query log pn-data-vault (Livello 2.2)',
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
        }),
        { continueOnFailure: true },
      )

      // ── Step 9: Query pn-ss logs (Livello 3) ─────────────────────────────
      .step(
        Runbook.queryCloudWatchLogs({
          id: 'query-pn-ss',
          label: 'Query log pn-ss (Livello 3)',
          logGroups: [SS_LOG_GROUP],
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

      // ── Step 10: Analyze pn-ss logs ───────────────────────────────────────
      .step(
        analyzeServiceLogs({
          id: 'analyze-pn-ss',
          label: 'Analisi log pn-ss',
          fromStep: 'query-pn-ss',
          varPrefix: 'ss',
        }),
        { continueOnFailure: true },
      )

      // ══════════════════════════════════════════════════════════════════════
      // ── Known Cases ─────────────────
      // ══════════════════════════════════════════════════════════════════════

      // ── Livello 2.1: pn-external-registries → Selfcare ReadTimeout ───────
      // [DOWNSTREAM] Service SelfcarePG returned errors=nested exception is
      // io.netty.handler.timeout.ReadTimeoutException
      .knownCase({
        id: 'selfcare-timeout-external-registries',
        description: 'Timeout verso il servizio Downstream SelfCare da pn-external-registries',
        priority: 100,
        condition: {
          type: 'pattern',
          ref: 'vars.externalRegistriesErrorMsg',
          regex:
            '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=nested exception is io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] Timeout verso il downstream SelfCare da pn-external-registries\n' +
            'Risoluzione: Problematica segnalata già da tempo al downstream coinvolto\n' +
            'Errore: {{vars.externalRegistriesErrorMsg}}',
        },
      })

      // ── Livello 2.1: pn-external-registries → ResourceAccessException ────
      // message: Exception caught by retry
      // stack_trace: org.springframework.web.client.ResourceAccessException:
      //   I/O error on GET request for "http://internal-EcsA-...
      //   ext-registry-private/pa/v1/groups-all": Read timed out;
      //   nested exception is java.net.SocketTimeoutException: Read timed out
      // Note: same Selfcare-related root cause as the case above.
      .knownCase({
        id: 'selfcare-io-error-external-registries',
        description: 'I/O error su pn-external-registries verso ext-registry-private (Selfcare)',
        priority: 95,
        condition: {
          type: 'or',
          conditions: [
            {
              type: 'pattern',
              ref: 'vars.externalRegistriesErrorMsg',
              regex: 'ResourceAccessException.*I/O error on GET.*ext-registry-private.*Read timed out',
            },
            {
              type: 'pattern',
              ref: 'vars.externalRegistriesErrorMsg',
              regex: 'Exception caught by retry.*SocketTimeoutException.*Read timed out',
            },
          ],
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] I/O error su pn-external-registries verso ext-registry-private\n' +
            'Risoluzione: Problematica segnalata già da tempo al downstream coinvolto\n' +
            'Errore: {{vars.externalRegistriesErrorMsg}}',
        },
      })

      // ── Livello 2.2: pn-data-vault → Selfcare ReadTimeout ────────────────
      // it.pagopa.pn.commons.exceptions.PnInternalException: Internal Server Error;
      //   nested exception is org.springframework.web.reactive.function.client
      //   .WebClientRequestException: nested exception is
      //   io.netty.handler.timeout.ReadTimeoutException
      // (stack_trace contains: Request to POST https://api.selfcare.pagopa.it/
      //   external/data-vault/v1/pn-pg/institutions/add [DefaultWebClient])
      .knownCase({
        id: 'data-vault-selfcare-timeout',
        description: 'Timeout verso il downstream Selfcare da pn-data-vault (WebClientRequestException)',
        priority: 90,
        condition: {
          type: 'pattern',
          ref: 'vars.dataVaultErrorMsg',
          regex: 'WebClientRequestException.*ReadTimeoutException|ReadTimeoutException.*selfcare\\.pagopa\\.it',
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] Timeout verso il downstream Selfcare da pn-data-vault\n' +
            'Risoluzione: Solitamente causato da un disservizio temporaneo. Se non si riverifica nel breve è possibile ignorarlo\n' +
            'Errore: {{vars.dataVaultErrorMsg}}',
        },
      })

      // ── Livello 2.2: pn-data-vault → [DOWNSTREAM] SelfcarePG 500 ─────────
      // [DOWNSTREAM] Service SelfcarePG returned errors=500 Internal Server Error
      //   from POST https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add
      .knownCase({
        id: 'data-vault-selfcare-downstream',
        description: 'Errore 500 dal servizio Downstream SelfcarePG su pn-data-vault',
        priority: 85,
        condition: {
          type: 'pattern',
          ref: 'vars.dataVaultErrorMsg',
          regex: '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=500',
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] Errore 500 dal servizio Downstream SelfcarePG su pn-data-vault\n' +
            'Risoluzione: Solitamente causato da un disservizio temporaneo. Se non si riverifica nel breve è possibile ignorarlo\n' +
            'Errore: {{vars.dataVaultErrorMsg}}',
        },
      })

      // ── Livello 2.2: pn-data-vault → Connection aborted ──────────────────
      // Caused by: reactor.netty.channel.AbortedException:
      //   Connection has been closed BEFORE send operation
      .knownCase({
        id: 'data-vault-connection-aborted',
        description: "Connection aborted da pn-data-vault prima dell'invio della richiesta",
        priority: 80,
        condition: {
          type: 'pattern',
          ref: 'vars.dataVaultErrorMsg',
          regex: 'AbortedException.*Connection has been closed BEFORE send operation',
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            "[CASO NOTO] Connection aborted da pn-data-vault prima dell'invio della richiesta\n" +
            "Risoluzione: Trattandosi di un evento occasionale non c'è nessuna azione da intraprendere\n" +
            'Errore: {{vars.dataVaultErrorMsg}}',
        },
      })

      // ── Livello 3: pn-ss → pn-f24 not has privilege (403) ────────────────
      // Ending process getFile() with errors=403 FORBIDDEN
      //   "Client: pn-f24 not has privilege for read document type class DocumentType"
      // Description: errore causato da Comune di Monte San Savino.
      //   pn-f24 accede a un file .pdf invece di .json (metadati modello f24).
      .knownCase({
        id: 'pn-f24-not-privileged-pn-ss',
        description:
          'Client pn-f24 non ha privilegi per leggere il document type su pn-ss (Comune di Monte San Savino)',
        priority: 75,
        condition: {
          type: 'pattern',
          ref: 'vars.ssErrorMsg',
          regex: 'pn-f24 not has privilege for read document type',
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] Client pn-f24 non ha privilegi per accedere a un file su pn-ss\n' +
            'Risoluzione: Verificare che la notifica sia associata all\'ente "Comune di Monte San Savino"\n' +
            'Errore: {{vars.ssErrorMsg}}',
        },
      })

      // ── Livello 1: pn-delivery → pn-external-registry unavailable ────────
      // Error during retrieve of the groups
      // org.springframework.web.client.ResourceAccessException: I/O error on GET
      //   request for "http://internal-EcsA-...ext-registry-private/pa/v1/groups-all":
      //   Read timed out; nested exception is java.net.SocketTimeoutException
      .knownCase({
        id: 'ext-registry-unavailable',
        description: 'Errore di rete su pn-delivery - pn-external-registry non disponibile',
        priority: 70,
        condition: {
          type: 'or',
          conditions: [
            {
              type: 'pattern',
              ref: 'vars.deliveryErrorMsg',
              regex:
                'Error during retrieve of the group.*ResourceAccessException.*ext-registry-private.*Read timed out',
            },
            {
              type: 'and',
              conditions: [
                {
                  type: 'pattern',
                  ref: 'vars.deliveryErrorMsg',
                  regex: 'Error during retrieve of the group',
                },
                {
                  type: 'pattern',
                  ref: 'vars.deliveryErrorMsg',
                  regex: 'SocketTimeoutException.*Read timed out',
                },
              ],
            },
          ],
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] Errore di rete su pn-delivery - pn-external-registry non disponibile\n' +
            'Risoluzione: Da segnalare se si protrae nel tempo\n' +
            'Errore: {{vars.deliveryErrorMsg}}',
        },
      })

      // ── Livello 0: Gateway Timeout 504 ───────────────────────────────────
      // Nessun log di errore su pn-delivery, timeout di 29s superato in fase
      // di risposta verso l'apigw.
      .knownCase({
        id: 'gateway-timeout-504',
        description: 'Gateway Timeout 504 - Nessun log su pn-delivery, timeout superato verso API GW',
        priority: 60,
        condition: {
          type: 'compare',
          ref: 'vars.apiGwStatusCode',
          operator: '==',
          value: '504',
        },
        action: {
          type: 'log',
          level: 'info',
          message:
            '[CASO NOTO] Gateway Timeout 504 - Nessun log di errore su pn-delivery\n' +
            'Risoluzione: Nessuna azione necessaria\n' +
            'Status Code: {{vars.apiGwStatusCode}}',
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
          'pn-delivery: {{vars.deliveryErrorMsg}}\n' +
          'pn-external-registries: {{vars.externalRegistriesErrorMsg}}\n' +
          'pn-data-vault: {{vars.dataVaultErrorMsg}}\n' +
          'pn-ss: {{vars.ssErrorMsg}}',
      })

      .build()
  );
}
