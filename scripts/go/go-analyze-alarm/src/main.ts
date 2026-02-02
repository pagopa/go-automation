/**
 * Go Analyze Alarm - Main Logic Module
 *
 * Contains the core business logic for the script.
 * Receives typed dependencies (script + config) for clean separation of concerns.
 */

import { Core } from '@go-automation/go-common';

import type { GoAnalyzeAlarmConfig } from './config.js';

/**
 * Main script execution function
 *
 * This function contains the core business logic, decoupled from
 * script initialization and configuration parsing.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Go Analyze Alarm');

  // Example: Log configuration
  const config = await script.getConfiguration<GoAnalyzeAlarmConfig>();
  script.logger.text(`Config: ${JSON.stringify(config, null, 2)}`);

  // Your business logic here
  script.logger.info('Hello from go-analyze-alarm!');

  // doSomethingBusinessLogic(config);
}
