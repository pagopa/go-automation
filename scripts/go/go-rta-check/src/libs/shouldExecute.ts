/**
 * Execution gate between the preview and the actual run.
 *
 * Groups the three reasons why, after showing what would be analysed, the run
 * stops before touching AWS: there is nothing to analyse, the caller asked for a
 * preview only (`--dry-run`), or the confirmation was declined.
 */
import type { Core } from '@go-automation/go-common';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { confirmRun } from './promptInputs.js';

export interface ShouldExecuteOptions {
  readonly script: Core.GOScript;
  readonly config: GoRtaCheckConfig;
  /** Occurrences found in the period, before `--limit`. */
  readonly totalEvents: number;
  /** Occurrences that would actually be processed, after `--limit`. */
  readonly occurrences: number;
  /** Whether the confirmation may be asked for; when false the run is auto-confirmed. */
  readonly allowPrompt: boolean;
}

/**
 * Decides whether the runbooks must actually be executed, logging the reason
 * when they must not.
 *
 * @param options - Script, configuration and occurrence counts
 * @returns `true` when the run can proceed
 */
export async function shouldExecute(options: ShouldExecuteOptions): Promise<boolean> {
  const { script, config } = options;
  const logger = script.logger;

  if (options.totalEvents === 0) {
    logger.warning('Nessuna occorrenza nel periodo selezionato.');
    return false;
  }
  if (config.dryRun === true) {
    logger.success('Dry-run: nessuna esecuzione runbook. Fine.');
    return false;
  }
  if (!(await confirmRun(script, options.occurrences, options.allowPrompt))) {
    logger.warning('Operazione annullata.');
    return false;
  }
  return true;
}
