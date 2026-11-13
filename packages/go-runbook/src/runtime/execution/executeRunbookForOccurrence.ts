/**
 * In-process execution of an alarm runbook for a single occurrence.
 *
 * Reuses the engine and the shared automatic registry, and returns the
 * stable {@link RunbookOutput} contract (same shape persisted by the CLI), so
 * external tools (e.g. `go-rta-check`) can run a runbook per occurrence
 * without spawning a subprocess or parsing files.
 */
import type { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../../engine/core/RunbookEngine.js';
import { buildRunbookOutput } from '../../toolkits/common/output/buildRunbookOutput.js';
import type { RunbookOutput } from '../../toolkits/common/output/RunbookOutput.js';
import type { ServiceRegistry } from '../../toolkits/common/services/ServiceRegistry.js';
import type { ExecutionEnvironment } from '../../engine/tracing/ExecutionInfo.js';
import { assertCloudExecutableRunbook } from '../../toolkits/common/policies/assertCloudExecutableRunbook.js';

import { RUNBOOK_CATALOG } from '../../inventory/registry/runbookRegistry.js';
import { buildCatalogOutputContext } from './buildCatalogOutputContext.js';
import { computeRunbookTimeRange } from '../../toolkits/common/time/occurrence/computeRunbookTimeRange.js';
import { createTimeRangeReference } from '../../toolkits/common/time/occurrence/createTimeRangeReference.js';

/** Dependencies built once and reused across occurrences. */
export interface ExecuteRunbookForOccurrenceDeps {
  readonly services: ServiceRegistry;
  readonly logger: GOLogger;
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
      ? RUNBOOK_CATALOG.resolveByAlarmName(input.alarmName)
      : RUNBOOK_CATALOG.resolveByKey(input.runbookKey);
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
    ['awsAccountId', input.awsAccountId],
    ['awsRegion', input.region],
    ['awsProfiles', input.awsProfiles.join(',')],
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
    contextBuilder: buildCatalogOutputContext,
  });
}
