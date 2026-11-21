import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import type { RunbookOutput } from '@pagopa/go-runbook/output';

import type { RunbookCheck } from '../../types/RtaCheckReport.js';

/** Instant of the occurrence and of every timestamp in the fixtures. */
export const NOW = '2026-01-01T00:00:00.000Z';

/** Runbook check that matched the `lambda-timeout` known case. */
export const HIT: RunbookCheck = {
  status: 'HIT',
  matchedCaseIds: ['lambda-timeout'],
};

/**
 * Builds the output of a runbook that matched `lambda-timeout` on a Lambda request.
 *
 * @param requestId - Lambda request id exposed in the output context
 * @returns A completed runbook output
 */
export function runbookOutputFixture(requestId: string): RunbookOutput {
  return {
    schemaVersion: '3.0.0',
    generatedAt: NOW,
    runbook: { id: 'r', name: 'r', type: 'alarm-resolution', version: '1.0.0', team: 'GO' },
    execution: {
      executionId: 'e',
      startedAt: NOW,
      completedAt: NOW,
      durationMs: 1,
      status: 'completed',
      stepsExecuted: 1,
      recoveredErrors: [],
    },
    input: {},
    outcome: {
      kind: 'known-case-matched',
      detections: [
        {
          caseId: 'lambda-timeout',
          description: 'Timeout runtime della Lambda',
          evidenceRows: 1,
          resolvedMessage: 'Timeout Lambda',
          observations: [],
        },
      ],
      message: 'La Lambda ha superato il timeout configurato.',
    },
    chains: [],
    coverage: { complete: true, sources: [] },
    context: { fields: [{ name: 'lambdaRequestId', label: 'requestId', value: requestId }], evidence: [] },
  };
}

/**
 * Builds a completed Watchtower analysis, overriding the given fields.
 *
 * @param partial - Fields that differ from the defaults
 * @returns A full analysis DTO
 */
export function alarmAnalysisFixture(partial: Partial<AlarmAnalysisDto>): AlarmAnalysisDto {
  return {
    alarm: { id: 'alarm-id', name: 'alarm-name' },
    alarmId: 'alarm-id',
    analysisDate: NOW,
    analysisType: 'ANALYZABLE',
    avgMttaMs: null,
    avgMttfMs: null,
    avgMttrMs: null,
    conclusionNotes: null,
    createdAt: NOW,
    createdBy: { email: 'operator@example.invalid', id: 'operator-id', name: 'Operator' },
    createdById: 'operator-id',
    downstreams: [],
    environment: { id: 'environment-id', name: 'production' },
    environmentId: 'environment-id',
    errorDetails: null,
    finalActions: [],
    firstAlarmAt: NOW,
    id: 'analysis-id',
    ignoreDetails: null,
    ignoreReason: null,
    ignoreReasonCode: null,
    isOnCall: true,
    lastAlarmAt: NOW,
    linkedEventsCount: 1,
    links: [],
    occurrences: 1,
    operator: { email: 'operator@example.invalid', id: 'operator-id', name: 'Operator' },
    operatorId: 'operator-id',
    product: { id: 'product-id', name: 'product' },
    productId: 'product-id',
    qualityScore: null,
    resources: [],
    runbook: null,
    runbookId: null,
    scoredAt: null,
    status: 'COMPLETED',
    trackingIds: [],
    updatedAt: NOW,
    updatedBy: null,
    updatedById: null,
    validationScore: null,
    ...partial,
  };
}
