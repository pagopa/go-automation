/**
 * Prompt policy of the selection wizard.
 *
 * The wizard is interactive by default, but the script must also run unattended
 * (CI, cron, Lambda), where a prompt would hang the command instead of failing
 * it. This module concentrates the single question every step asks: may I ask?
 */
import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';

/**
 * Decides whether the wizard may prompt.
 *
 * Prompts are disabled when any of these holds:
 * - `--non-interactive` was passed (explicit, and the only reliable switch in CI);
 * - stdin is not a TTY, so no answer could ever arrive;
 * - the historical flag-driven combination `--alarm-name` + `--date-from` is
 *   present, which existing invocations rely on to run unattended.
 *
 * @param config - Validated script configuration
 * @param isTty - Whether stdin can carry an answer (`process.stdin.isTTY`)
 * @returns `true` when the wizard is allowed to ask the user
 */
export function allowsPrompt(config: GoRtaCheckConfig, isTty: boolean): boolean {
  if (config.nonInteractive === true) return false;
  if (!isTty) return false;
  return !isFlagDriven(config);
}

/** The pre-wizard convention: an alarm and a period pinned by flags means unattended. */
function isFlagDriven(config: GoRtaCheckConfig): boolean {
  return (
    config.alarmName !== undefined && config.alarmName !== '' && config.dateFrom !== undefined && config.dateFrom !== ''
  );
}
