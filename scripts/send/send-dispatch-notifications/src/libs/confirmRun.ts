/**
 * Confirmation before sending (§14.2).
 */

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { SendDispatchNotificationsConfig } from '../types/SendDispatchNotificationsConfig.js';

/**
 * Asks for confirmation. In production both the interactive confirmation
 * and `--confirm-production=<valid rows>` are required, and `--yes` is not
 * enough.
 *
 * @param script - GOScript instance
 * @param config - Script configuration
 * @param target - Target of the run
 * @param summary - Validation summary
 * @returns Whether to proceed
 */
export async function confirmRun(
  script: Core.GOScript,
  config: SendDispatchNotificationsConfig,
  target: DispatchTarget,
  summary: Dispatch.ValidationSummary,
): Promise<boolean> {
  if (target.production) {
    if (config.confirmProduction !== summary.validRows) {
      script.logger.error(
        `Produzione: rilancia con --confirm-production=${summary.validRows} (numero di righe valide) per confermare`,
      );
      return false;
    }
    return (await script.prompt.confirm(`Inviare ${summary.validRows} notifiche IN PRODUZIONE?`, false)) === true;
  }
  if (config.yes) return true;
  return (await script.prompt.confirm(`Inviare ${summary.validRows} notifiche?`, false)) === true;
}
