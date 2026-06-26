import { Core } from '@go-automation/go-common';

import type { ExecuteRunbookConfig } from './types/ExecuteRunbookConfig.js';
import { buildExecuteRunbookDeps } from './libs/buildExecuteRunbookDeps.js';
import { confirmApplyGuard } from './libs/confirmApplyGuard.js';
import { executeRunbook, executeRunbookDryRun } from './libs/executeRunbook.js';
import { installProcessSignalForwarding } from './libs/installProcessSignalForwarding.js';
import { resolveApplyMode } from './libs/resolveApplyMode.js';
import { resolveDryRunTimeoutMs } from './libs/resolveDryRunTimeoutMs.js';
import { resolveExecuteRunbookInput } from './libs/resolveExecuteRunbookInput.js';
import {
  CLI_SYNTHETIC_DELIVERY_GRACE_MS,
  LEGACY_SYNTHETIC_DELIVERY_GRACE_MS,
  syntheticDelivery,
} from './libs/syntheticDelivery.js';
import { validateModeCombination } from './libs/validateModeCombination.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<ExecuteRunbookConfig>();
  const alarmEventId = config.alarmEventId?.trim();
  const executionId = config.executionId?.trim();
  const dryRun = config.dryRun === true;
  const applyMode = resolveApplyMode(config.apply);
  const dryRunTimeoutMs = dryRun ? resolveDryRunTimeoutMs(config.dryRunTimeoutMs) : undefined;
  if (!alarmEventId) {
    const alarmEventIdFlag = Core.GOConfigKeyTransformer.toCLIFlag('alarm.event.id');
    throw new Error(`${alarmEventIdFlag} is required for CLI execution`);
  }
  validateModeCombination(executionId, dryRun, applyMode);

  if (executionId) {
    const deps = await buildExecuteRunbookDeps(script, config, { auth: 'SERVICE' });
    const cliConfig = { ...config, alarmEventId, executionId };
    const input = await resolveExecuteRunbookInput(deps, cliConfig);
    const result = await executeRunbook(
      deps,
      input,
      syntheticDelivery(executionId, { graceMs: LEGACY_SYNTHETIC_DELIVERY_GRACE_MS }),
    );
    script.logger.info(`Execution ${result.executionId}: ${result.status} (${result.disposition})`);
    return;
  }

  const humanToken = config.watchtowerHumanToken?.trim();
  if (!humanToken) {
    const tokenFlag = Core.GOConfigKeyTransformer.toCLIFlag('watchtower.human.token');
    throw new Error(
      `${tokenFlag} is required when ${Core.GOConfigKeyTransformer.toCLIFlag('execution.id')} is not provided`,
    );
  }

  await confirmApplyGuard(script, config, applyMode);
  const deps = await buildExecuteRunbookDeps(
    script,
    { ...config, watchtowerHumanToken: humanToken },
    { auth: 'CLI_PAT' },
  );

  if (dryRun) {
    const preview = await deps.watchtower.previewCliAutomaticRunbookExecution({ alarmEventId, mode: applyMode });
    const abortController = new AbortController();
    const removeSignalHandlers = installProcessSignalForwarding(abortController);
    try {
      const result = await executeRunbookDryRun(deps, preview.command, {
        ...(dryRunTimeoutMs === undefined ? {} : { timeoutMs: dryRunTimeoutMs }),
        signal: abortController.signal,
      });
      script.logger.info(
        `[dry-run] Execution ${result.executionId}: ${result.outcome} (${result.check.status})${
          result.runbookKey === undefined ? '' : ` runbook=${result.runbookKey}@${result.runbookVersion ?? 'unknown'}`
        }`,
      );
    } finally {
      removeSignalHandlers();
    }
    return;
  }

  const created = await deps.watchtower.createCliAutomaticRunbookExecution({ alarmEventId, mode: applyMode });
  const result = await executeRunbook(
    deps,
    created.command,
    syntheticDelivery(created.execution.id, { graceMs: CLI_SYNTHETIC_DELIVERY_GRACE_MS }),
  );
  script.logger.info(`Execution ${result.executionId}: ${result.status} (${result.disposition})`);
}
