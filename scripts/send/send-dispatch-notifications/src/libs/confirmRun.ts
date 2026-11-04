/**
 * Confirmation before the run (§14.2).
 */

import type { Core } from '@go-automation/go-common';

import type { ConfirmOutcome } from '../types/ConfirmOutcome.js';
import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { PlannedWork } from '../types/PlannedWork.js';
import type { ValidatedConfig } from '../types/ValidatedConfig.js';

/** Exit code when production confirmation is missing or wrong. */
export const EXIT_NOT_CONFIRMED = 1;
/** Exit code when the user declines the interactive confirmation: nothing sent. */
export const EXIT_DECLINED = 3;

/**
 * Asks for confirmation. In production both `--confirm-production=<N>` (N =
 * rows to send, or rows to process when the session sends nothing) and the
 * interactive confirmation are required, and `--yes` is not enough.
 *
 * @param script - GOScript instance (logger and prompt)
 * @param config - Validated configuration (`yes`, `confirmProduction`)
 * @param target - Target of the run
 * @param work - What the session will do
 * @returns The outcome: proceed, declined by the user, or not confirmed
 */
export async function confirmRun(
  script: Pick<Core.GOScript, 'logger' | 'prompt'>,
  config: Pick<ValidatedConfig, 'yes' | 'confirmProduction'>,
  target: Pick<DispatchTarget, 'production'>,
  work: PlannedWork,
): Promise<ConfirmOutcome> {
  const what = work.sending ? `Inviare ${work.rows} notifiche` : `Elaborare ${work.rows} righe (nessun invio)`;
  if (target.production) {
    if (config.confirmProduction !== work.rows) {
      const counted = work.sending ? 'righe da inviare' : 'righe da elaborare';
      script.logger.error(
        `Produzione: rilancia con --confirm-production=${work.rows} (numero di ${counted}) per confermare`,
      );
      return 'NOT_CONFIRMED';
    }
    return answer(await script.prompt.confirm(`${what} IN PRODUZIONE?`, false));
  }
  if (config.yes) return 'CONFIRMED';
  return answer(await script.prompt.confirm(`${what}?`, false));
}

/**
 * Exit code of a run stopped at the confirmation.
 *
 * @param outcome - Outcome other than `CONFIRMED`
 * @returns `1` without the production confirmation, `3` when declined
 */
export function exitCodeForConfirmation(outcome: Exclude<ConfirmOutcome, 'CONFIRMED'>): number {
  return outcome === 'NOT_CONFIRMED' ? EXIT_NOT_CONFIRMED : EXIT_DECLINED;
}

function answer(value: boolean | undefined): ConfirmOutcome {
  return value === true ? 'CONFIRMED' : 'DECLINED';
}
