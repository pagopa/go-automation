/**
 * In-process execution of an alarm runbook for a single occurrence.
 *
 * Reuses the engine and the shared automatic registry, and returns the
 * stable {@link RunbookOutput} contract (same shape persisted by the CLI), so
 * external tools (e.g. `go-rta-check`) can run a runbook per occurrence
 * without spawning a subprocess or parsing files.
 */
import { Core } from '@go-automation/go-common';

import * as apigw from '../apigw/index.js';
import { RunbookEngine } from '../core/RunbookEngine.js';
import * as lambda from '../lambda/index.js';
import { buildRunbookOutput } from '../output/buildRunbookOutput.js';
import type { RunbookOutput } from '../output/RunbookOutput.js';
import * as service from '../service/index.js';
import type { ServiceRegistry } from '../registry/ServiceRegistry.js';
import type { ExecutionEnvironment } from '../trace/ExecutionInfo.js';
import { assertCloudExecutableRunbook } from '../validation/assertCloudExecutableRunbook.js';

import { AUTOMATIC_RUNBOOK_REGISTRY } from './runbookRegistry.js';
import { computeRunbookTimeRange } from './computeRunbookTimeRange.js';
import { createTimeRangeReference } from './createTimeRangeReference.js';

/** Dependencies built once and reused across occurrences. */
export interface ExecuteRunbookForOccurrenceDeps {
  readonly services: ServiceRegistry;
  readonly logger: Core.GOLogger;
}

/** Per-occurrence input. */
export interface ExecuteRunbookForOccurrenceInput {
  readonly alarmName: string;
  /** Stable registry key pinned by the managed cloud command. */
  readonly runbookKey?: string;
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
  const resolved =
    input.runbookKey === undefined
      ? AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(input.alarmName)
      : AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey(input.runbookKey);
  if (resolved === undefined) {
    throw new Error(
      input.runbookKey === undefined
        ? `No runbook registered for alarm "${input.alarmName}".`
        : `No runbook registered with key "${input.runbookKey}".`,
    );
  }
  if (!resolved.descriptor.alarmNames.includes(input.alarmName)) {
    throw new Error(`Runbook "${resolved.descriptor.key}" does not support alarm "${input.alarmName}".`);
  }
  const runbook = resolved.build();
  if (input.executionMode === 'cloud') {
    assertCloudExecutableRunbook(runbook);
  }

  const reference = createTimeRangeReference(input.firedAt, input.alarmDatetimeEnd);
  const { startTime, endTime } = computeRunbookTimeRange(runbook, reference);

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

  const engine = new RunbookEngine(deps.logger);
  const result = await engine.execute(runbook, params, deps.services, environment, input.signal);

  return buildRunbookOutput(runbook, result, {
    contextBuilder: (rb, executionResult) =>
      apigw.buildApiGwOutputContext(rb, executionResult) ??
      lambda.buildLambdaOutputContext(rb, executionResult) ??
      service.buildServiceOutputContext(rb, executionResult),
  });
}
