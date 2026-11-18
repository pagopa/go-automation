import type { RunbookExecutionResult } from '../../engine/types/RunbookExecutionResult.js';
import { createTestContext } from './createTestContext.js';
import type { TestExecutionResultOptions } from './TestExecutionResultOptions.js';

/**
 * Builds the result of an execution of `test-runbook` that ran no step, with a
 * complete trace, for the builders that read a finished execution.
 *
 * @param options - Final context, status and matched cases
 * @returns The result; spread it to replace parts of the trace
 */
export function createTestExecutionResult(options: TestExecutionResultOptions = {}): RunbookExecutionResult {
  const status = options.status ?? 'completed';
  const matchedCases = options.matchedCases ?? [];
  const finalContext = createTestContext(options);
  return {
    runbookId: 'test-runbook',
    status,
    matchedCases,
    durationMs: 0,
    stepsExecuted: 0,
    finalContext,
    recoveredErrors: finalContext.recoveredErrors,
    trace: {
      schemaVersion: '1.0.0',
      execution: {
        executionId: finalContext.executionId,
        runbookId: 'test-runbook',
        runbookName: 'Test runbook',
        runbookVersion: '1.0.0',
        runbookType: 'alarm-resolution',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:00.000Z',
        durationMs: 0,
        status,
        environment: { awsProfiles: [], region: 'eu-south-1', invokedBy: 'manual' },
      },
      input: { ...options.params },
      pipeline: [],
      variables: { ...options.vars },
      caseMatching: { casesEvaluated: 0, evaluations: [], matchedCaseIds: matchedCases.map(({ id }) => id) },
      actionsExecuted: [],
      summary: {
        description: status,
        totalSteps: 0,
        stepsExecuted: 0,
        stepsFailed: 0,
        stepsRecovered: 0,
        stepsSkipped: 0,
        outcome: '',
      },
    },
  };
}
