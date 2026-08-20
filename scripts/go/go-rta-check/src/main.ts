/**
 * Go RTA Check - Main orchestration.
 *
 * Three modes, selected by the `mode` parameter:
 * - `analyses` (default): login Watchtower → resolve product/alarm/period → fetch
 *   occurrences → (per occurrence) run runbook in-process → classify V1 → compare
 *   V2 with the analysis → report (console + JSON/HTML);
 * - `coverage`: login Watchtower → load the census → compare it with the runbook
 *   declarations → coverage report;
 * - `readiness`: coverage plus the shadow observation window.
 *
 * Every mode reports its outcome as an exit code, so a run that could not be
 * executed never looks successful to a pipeline. Step logic lives under `libs/`.
 */
import { Core } from '@go-automation/go-common';

import type { GoRtaCheckConfig } from './types/GoRtaCheckConfig.js';
import { resolveRunOptions } from './libs/resolveRunOptions.js';
import { runAnalysesMode } from './libs/runAnalysesMode.js';
import { runCoverageMode } from './libs/runCoverageMode.js';
import { runReadinessMode } from './libs/runReadinessMode.js';
import { COVERAGE_EXIT_CODES } from './libs/runCoverageCheck.js';
import { resolveProcessExitCode } from './libs/resolveProcessExitCode.js';

/**
 * Script entry: validates the run options and hands over to the selected mode.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoRtaCheckConfig>();
  script.logger.section('Go RTA Check');

  const options = resolveRunOptions(script.logger, config);
  if (options === undefined) {
    process.exitCode = COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
    return;
  }

  if (options.mode === 'analyses') {
    process.exitCode = await runAnalysesMode(script, config, options);
    return;
  }

  const verdict =
    options.mode === 'coverage' ? await runCoverageMode(script, config) : await runReadinessMode(script, config);
  process.exitCode = resolveProcessExitCode(verdict, config.exitCodeOnFindings === true);
}
