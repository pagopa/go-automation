/**
 * Error handler for the upload workflow.
 */

import { GOHttpClientError } from '@pagopa/go-common/http';
import type { GOLogger } from '@pagopa/go-common/logging';
import { valueToString } from '@pagopa/go-common/utils';

/**
 * Logs a detailed workflow error with cause chain and stack trace.
 *
 * @param error - The caught error
 * @param logger - GOLogger for error output
 */
export function handleWorkflowError(error: unknown, logger: GOLogger): void {
  if (error instanceof GOHttpClientError) {
    logger.error(`Workflow failed: ${error.message} - response: ${JSON.stringify(error.response, null, 2)}`);
  } else if (error instanceof Error) {
    logger.error(`Workflow failed: ${error.message}`);
    if (error.cause !== undefined) {
      const causeMsg = error.cause instanceof Error ? error.cause.message : valueToString(error.cause);
      logger.error(`Caused by: ${causeMsg}`);
    }
    logger.fatal(`Stack trace:\n${error.stack}`);
  } else {
    logger.error(`Workflow failed: ${String(error)}`);
  }
}
