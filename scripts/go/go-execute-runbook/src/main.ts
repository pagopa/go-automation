import { Core } from '@go-automation/go-common';

import type { ExecuteRunbookConfig } from './types/ExecuteRunbookConfig.js';
import { buildExecuteRunbookDeps } from './libs/buildExecuteRunbookDeps.js';
import { executeRunbook } from './libs/executeRunbook.js';
import { resolveExecuteRunbookInput } from './libs/resolveExecuteRunbookInput.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<ExecuteRunbookConfig>();
  if (config.alarmEventId === undefined || config.executionId === undefined) {
    const alarmEventIdFlag = Core.GOConfigKeyTransformer.toCLIFlag('alarm.event.id');
    const executionIdFlag = Core.GOConfigKeyTransformer.toCLIFlag('execution.id');
    throw new Error(`${alarmEventIdFlag} and ${executionIdFlag} are required for CLI execution`);
  }
  const deps = await buildExecuteRunbookDeps(script, config);
  const cliConfig = { ...config, alarmEventId: config.alarmEventId, executionId: config.executionId };
  const input = await resolveExecuteRunbookInput(deps, cliConfig);
  const result = await executeRunbook(deps, input, {
    sqsMessageId: `cli:${cliConfig.alarmEventId}`,
    approximateReceiveCount: 1,
    workerDeadlineAt: new Date(Date.now() + 12 * 60_000).toISOString(),
  });
  script.logger.info(`Execution ${result.executionId}: ${result.status} (${result.disposition})`);
}
