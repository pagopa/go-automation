/**
 * Runbook: pn-delivery-IO_EXP-ApiGwAlarm
 */

import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';
import { SetVarStep } from '../../../steps/control/SetVarStep.js';
import { readStepOutput } from '../../../steps/data/readStepOutput.js';
import { readRowField, type ResultField } from '@go-automation/go-common/aws';

/**
 * Builds the pn-delivery-IO_EXP-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-delivery-IO_EXP-ApiGwAlarm',
    metadata: {
      name: 'pn-delivery-IO_EXP-ApiGwAlarm',
      description: 'Diagnosi degli errori API IO_EXP: invocazione authorizer, integrazione AWS e servizi applicativi',
      version: '3.1.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    // Query execution logs before classifying authorizer failures: a gateway
    // invocation 504 without a Lambda request ID does not prove a handler timeout.
    executionLogAnalysisMode: 'best-effort',
    paginateAccessLogResults: true,
    hooks: [
      {
        at: 'before-service-traversal',
        silent: true,
        step: {
          id: 'resolve-api-gw-diagnosis',
          label: 'Raggruppa gli execution log per richiesta e valuta i casi API Gateway',
          kind: 'transform',
          // eslint-disable-next-line @typescript-eslint/require-await
          execute: async (context) => {
            const upstream = readStepOutput<ReadonlyArray<ReadonlyArray<ResultField>>>(
              context,
              'query-api-gw-execution-logs',
            );
            if (!upstream.ok) return upstream.failure;
            const byRequestId = new Map<string, string[]>();
            for (const row of upstream.value) {
              const requestId = (readRowField(row, 'requestId') ?? '').trim();
              if (requestId === '' || requestId === '-') continue;
              const message = readRowField(row, '@message') ?? '';
              const messages = byRequestId.get(requestId);
              if (messages === undefined) byRequestId.set(requestId, [message]);
              else messages.push(message);
            }
            return {
              success: true,
              output: { requests: [...byRequestId].map(([requestId, messages]) => ({ requestId, messages })) },
              next: 'resolve' as const,
            };
          },
        },
      },
      {
        at: 'after-entry-analysis',
        silent: true,
        step: new SetVarStep({
          id: 'preserve-delivery-fallback',
          label: 'Conserva il fallback Delivery',
          varName: 'deliveryFallbackUuid',
          expression: '{{vars.fallbackUuid}}',
        }),
      },
      {
        at: 'after-entry-analysis',
        silent: true,
        step: new SetVarStep({
          id: 'use-xray-root-for-downstream',
          label: 'Correla i servizi tramite X-Ray root',
          varName: 'fallbackUuid',
          value: '',
        }),
      },
    ],
    analysisDefaults: {
      runbookName: 'pn-delivery-IO_EXP-ApiGwAlarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2912321697/pn-delivery-IO_EXP-ApiGwAlarm',
          name: 'pn-delivery IO_EXP',
          type: 'CONFLUENCE',
        },
      ],
    },
    knownCases: KNOWN_CASES,
  });
}
