/**
 * In-process execution of an alarm runbook for a single occurrence.
 *
 * Reuses the engine and the shared {@link RUNBOOK_REGISTRY}, and returns the
 * stable {@link RunbookOutput} contract (same shape persisted by the CLI), so
 * external tools (e.g. `go-rta-check`) can run a runbook per occurrence
 * without spawning a subprocess or parsing files.
 */
import { Core } from '@go-automation/go-common';
import {
  RunbookEngine,
  ConditionEvaluator,
  apigw,
  lambda,
  service,
  buildRunbookOutput,
  assertCloudExecutableRunbook,
} from '@go-automation/go-runbook';
import type { ServiceRegistry, RunbookOutput, ExecutionEnvironment } from '@go-automation/go-runbook';

import { RUNBOOK_REGISTRY } from './runbookRegistry.js';
import { computeTimeRange } from './computeTimeRange.js';
import { createTimeRangeReference } from './createTimeRangeReference.js';
import { DEFAULT_TIME_WINDOW_MINUTES } from './runbooks/constants.js';

/** Dependencies built once and reused across occurrences. */
export interface ExecuteRunbookForOccurrenceDeps {
  readonly services: ServiceRegistry;
  readonly logger: Core.GOLogger;
}

/** Per-occurrence input. */
export interface ExecuteRunbookForOccurrenceInput {
  readonly alarmName: string;
  /** Occurrence timestamp (ISO 8601) used as `alarmDatetime`. */
  readonly firedAt: string;
  /** Optional last-occurrence timestamp (ISO 8601) for multi-occurrence mode. */
  readonly alarmDatetimeEnd?: string;
  /** Source account queried through OAM. */
  readonly awsAccountId: string;
  /** AWS region of the occurrence and OAM sink/link. */
  readonly region: string;
  readonly awsProfiles: ReadonlyArray<string>;
  /** Managed cloud execution enforces the read-only v1 policy. */
  readonly executionMode?: 'local' | 'cloud';
  /** Cooperative cancellation propagated into the engine and services. */
  readonly signal?: AbortSignal;
}

/**
 * Builds and executes the runbook registered for `input.alarmName` against the
 * occurrence window and returns the structured {@link RunbookOutput}.
 *
 * @param deps - Shared services + logger (build once, reuse)
 * @param input - Per-occurrence alarm name, fired-at timestamp and profiles
 * @returns The structured runbook output (outcome, telemetry, context)
 * @throws Error when no runbook is registered for `input.alarmName`
 */
export async function executeRunbookForOccurrence(
  deps: ExecuteRunbookForOccurrenceDeps,
  input: ExecuteRunbookForOccurrenceInput,
): Promise<RunbookOutput> {
  const builder = RUNBOOK_REGISTRY.get(input.alarmName);
  if (builder === undefined) {
    throw new Error(`No runbook registered for alarm "${input.alarmName}".`);
  }
  const runbook = builder();
  if (input.executionMode === 'cloud') {
    assertCloudExecutableRunbook(runbook);
  }

  const reference = createTimeRangeReference(input.firedAt, input.alarmDatetimeEnd);
  const { startTime, endTime } = computeTimeRange(reference, DEFAULT_TIME_WINDOW_MINUTES);

  const params = new Map<string, string>([
    ['alarmName', input.alarmName],
    ['alarmDatetime', input.firedAt],
    ['startTime', startTime],
    ['endTime', endTime],
  ]);
  if (input.alarmDatetimeEnd !== undefined && input.alarmDatetimeEnd.trim() !== '') {
    params.set('alarmDatetimeEnd', input.alarmDatetimeEnd);
  }

  const environment: ExecutionEnvironment = {
    awsProfiles: [...input.awsProfiles],
    awsAccountId: input.awsAccountId,
    region: input.region,
    invokedBy: input.executionMode === 'cloud' ? 'alarm' : 'manual',
  };

  const engine = new RunbookEngine(deps.logger, new ConditionEvaluator());
  const result = await engine.execute(runbook, params, deps.services, environment, input.signal);

  return buildRunbookOutput(runbook, result, {
    contextBuilder: (rb, executionResult) =>
      apigw.buildApiGwOutputContext(rb, executionResult) ??
      lambda.buildLambdaOutputContext(rb, executionResult) ??
      service.buildServiceOutputContext(rb, executionResult),
  });
}
