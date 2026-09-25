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

  script.logger.info(`Execution mode: ${config.mode}`);
  script.logger.info(`Output directory: ${config.outputDir}`);

  const inputLines = await readInputLines(config.inputFile);
  reporter.setInitialTotal(inputLines.length);

  await executeStepByMode(script, config, inputLines, reporter);

  // Report finale con metriche
  await reporter.generateReport(config.outputDir, script.logger);

  script.logger.success('Paper Request Error Check run completed successfully');
}
