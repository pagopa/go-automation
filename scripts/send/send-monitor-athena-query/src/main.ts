/**
 * Send Monitor Athena Query - Main Logic Module
 *
 * Contains the core business logic for the script.
 * Receives typed dependencies (script + config) for clean separation of concerns.
 */

import { Core } from '@go-automation/go-common';

import { notifySlackErrorIfConfigured, runAthenaMonitorCycle } from './libs/index.js';
import type { SendMonitorAthenaQueryConfig } from './types/index.js';

/**
 * Main script execution function
 *
 * This function contains the core business logic, decoupled from
 * script initialization and configuration parsing.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Send Monitor Athena Query');
  const config = await script.getConfiguration<SendMonitorAthenaQueryConfig>();

  try {
    await runAthenaMonitorCycle(script, config);
  } catch (error) {
    await notifySlackErrorIfConfigured(script, config, error);
    throw error;
  }
}
