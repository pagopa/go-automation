import { GOConfigKeyTransformer } from '@go-automation/go-script';

import type { WatchtowerApplyMode } from '../types/WatchtowerApplyMode.js';

export function validateModeCombination(
  executionId: string | undefined,
  dryRun: boolean,
  applyMode: WatchtowerApplyMode,
): void {
  if (dryRun && executionId !== undefined) {
    throw new Error(
      `${GOConfigKeyTransformer.toCLIFlag('dry.run')} cannot be used with ${GOConfigKeyTransformer.toCLIFlag('execution.id')}`,
    );
  }
  if (dryRun && applyMode !== 'SHADOW') {
    throw new Error(
      `${GOConfigKeyTransformer.toCLIFlag('dry.run')} cannot be used with ${GOConfigKeyTransformer.toCLIFlag('apply')}`,
    );
  }
  if (executionId !== undefined && applyMode !== 'SHADOW') {
    throw new Error(
      `${GOConfigKeyTransformer.toCLIFlag('apply')} is supported only when the CLI creates the execution`,
    );
  }
}
