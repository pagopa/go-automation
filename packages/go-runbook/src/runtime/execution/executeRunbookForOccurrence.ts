/**
 * In-process execution of an alarm runbook for a single occurrence.
 *
 * Reuses the engine and the shared automatic registry, and returns the
 * stable {@link RunbookOutput} contract (same shape persisted by the CLI), so
 * external tools (e.g. `go-rta-check`) can run a runbook per occurrence
 * without spawning a subprocess or parsing files.
 */

import { OperationalRunbookEngine } from '../../toolkits/common/engine/OperationalRunbookEngine.js';
import { buildRunbookOutput } from '../../toolkits/common/output/buildRunbookOutput.js';
import type { RunbookOutput } from '../../toolkits/common/output/RunbookOutput.js';
import type { AwsExecutionEnvironment } from '../../toolkits/common/telemetry/AwsExecutionEnvironment.js';
import { assertCloudExecutableRunbook } from '../../toolkits/common/policies/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../inventory/registry/runbookRegistry.js';
import { buildOccurrenceParams } from './buildOccurrenceParams.js';
import type { ExecuteRunbookForOccurrenceDeps } from './ExecuteRunbookForOccurrenceDeps.js';
import type { ExecuteRunbookForOccurrenceInput } from './ExecuteRunbookForOccurrenceInput.js';

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

  const params = buildOccurrenceParams(runbook, {
    alarmName: input.alarmName,
    alarmDatetime: input.firedAt,
    ...(input.alarmDatetimeEnd === undefined ? {} : { alarmDatetimeEnd: input.alarmDatetimeEnd }),
    awsAccountId: input.awsAccountId,
    awsRegion: input.region,
    awsProfiles: input.awsProfiles,
  });

  const environment: AwsExecutionEnvironment = {
    awsProfiles: [...input.awsProfiles],
    awsAccountId: input.awsAccountId,
    region: input.region,
    invokedBy: input.executionMode === 'cloud' ? 'alarm' : 'manual',
  };

  const engine = new OperationalRunbookEngine(deps.logger);
  const result = await engine.execute(runbook, params, deps.services, environment, input.signal);

  return buildRunbookOutput(runbook, result);
}
