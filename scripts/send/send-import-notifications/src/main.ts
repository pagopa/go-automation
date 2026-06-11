/**
 * SEND Import Notifications - Main Logic Module
 *
 * Contains the core business logic for CSV notification import workflow.
 * Receives typed dependencies (script) for clean separation of concerns.
 */

import { Core } from '@go-automation/go-common';

import { setupEventListeners } from './libs/setupEventListeners.js';
import { handleWorkflowError } from './libs/handleWorkflowError.js';
import { createImportWorkflowComponents, executeImportWorkflow } from './libs/importWorkflow.js';
import type { ImportNotificationsConfig } from './types/ImportNotificationsConfig.js';

/**
 * Main script execution function.
 *
 * Imports notifications from CSV, uploads documents, sends to PN API,
 * polls for IUN and exports results.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<ImportNotificationsConfig>();
  const components = await createImportWorkflowComponents(script, config);

  setupEventListeners(components.worker, components.importer, components.exporter, script.prompt);
  script.logger.success('Components initialized');

  try {
    await executeImportWorkflow(script, config, components);
  } catch (error) {
    handleWorkflowError(error, script.logger);
    throw error;
  } finally {
    script.prompt.stopSpinner();
    await script.cleanup();
  }
}
