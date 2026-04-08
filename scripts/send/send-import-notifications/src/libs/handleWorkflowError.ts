/**
 * Error handler for the import workflow.
 */

import { Core } from '@go-automation/go-common';

/**
 * Logs a detailed workflow error with cause chain and stack trace.
 *
 * @param error - The caught error
 * @param logger - GOLogger for error output
 */
export function handleWorkflowError(error: unknown, logger: Core.GOLogger): void {
  if (error instanceof Core.GOHttpClientError) {
    logger.error(`Workflow failed: ${error.message} - response: ${JSON.stringify(error.response, null, 2)}`);
  } else if (error instanceof Error) {
    logger.error(`Workflow failed: ${error.message}`);
    if (error.cause !== undefined) {
      const causeMsg = error.cause instanceof Error ? error.cause.message : Core.valueToString(error.cause);
      logger.error(`Caused by: ${causeMsg}`);
    }
    logger.fatal(`Stack trace:\n${error.stack}`);
  } else {
    logger.error(`Workflow failed: ${String(error)}`);
  }
}
