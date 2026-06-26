import { Core } from '@go-automation/go-common';

import type { ExecuteRunbookConfig } from '../types/ExecuteRunbookConfig.js';
import type { WatchtowerApplyMode } from '../types/WatchtowerApplyMode.js';

export async function confirmApplyGuard(
  script: Core.GOScript,
  config: ExecuteRunbookConfig,
  applyMode: WatchtowerApplyMode,
): Promise<void> {
  if (applyMode === 'SHADOW') return;
  const target = config.watchtowerUrl;
  script.logger.info(`Watchtower apply mode ${applyMode} against ${target}`);
  if (!isLocalWatchtowerUrl(target)) {
    const confirmed =
      config.confirmApply === true ||
      (script.environment.isInteractive
        ? (await script.prompt.confirm(`Confermi ${applyMode} contro ${target}?`, false)) === true
        : false);
    if (!confirmed) {
      throw new Error(
        `${Core.GOConfigKeyTransformer.toCLIFlag('confirm.apply')} is required for apply mode against a non-local Watchtower URL`,
      );
    }
  }
  if (applyMode === 'APPLY_ALL') {
    const confirmedAll =
      config.confirmApplyAll === true ||
      (script.environment.isInteractive
        ? (await script.prompt.confirm(
            'Confermi APPLY_ALL? Può creare o aggiornare analisi anche per casi non riconosciuti.',
            false,
          )) === true
        : false);
    if (!confirmedAll) {
      throw new Error(`${Core.GOConfigKeyTransformer.toCLIFlag('confirm.apply.all')} is required for apply all`);
    }
  }
}

function isLocalWatchtowerUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}
