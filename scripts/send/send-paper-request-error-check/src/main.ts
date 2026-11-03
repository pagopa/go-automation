/**
 * Send Paper Request Error Check - Main Logic Module
 *
 * Logica principale di orchestrazione dello script.
 */

import { Core } from '@go-automation/go-common';

import type { SendPaperRequestErrorCheckConfig } from './types/index.js';
import { readInputLines } from './libs/readInputLines.js';
import { executeStepByMode } from './libs/stepRunners.js';
import { PaperRequestReporter } from './libs/reporter.js';

/**
 * Main script execution function
 *
 * @param script - Istanza GOScript per il logging ed il ciclo di vita
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Send Paper Request Error Check');
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const reporter = new PaperRequestReporter();

  const outputPathInfo = script.paths.resolvePathWithInfo(config.outputDir ?? '', Core.GOPathType.OUTPUT);

  script.logger.info(`Execution mode: ${config.mode}`);
  if (outputPathInfo.isAbsolute) {
    script.logger.info(`Output directory (absolute): ${outputPathInfo.path}`);
  } else {
    script.logger.info(`Output directory: ${outputPathInfo.path}`);
  }

  const inputLines = await readInputLines(config.inputFile);
  reporter.setInitialTotal(inputLines.length);

  await executeStepByMode(script, config, inputLines, reporter);

  // Report finale con metriche
  const metrics = await reporter.generateReport(outputPathInfo.path, script);
  if ((metrics.errorsCount ?? 0) > 0) {
    throw new Error(`Paper Request Error Check completed with ${metrics.errorsCount} operational errors`);
  }

  script.logger.success('Paper Request Error Check run completed successfully');
}
