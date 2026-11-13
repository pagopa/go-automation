import { NOOP_RUNBOOK_REPORTER } from '../reporting/NOOP_RUNBOOK_REPORTER.js';
import type { WorkflowServices } from '../types/WorkflowServices.js';

/**
 * Services for engine tests: only the silent reporter.
 *
 * @returns Workflow services with {@link NOOP_RUNBOOK_REPORTER}
 */
export function createTestWorkflowServices(): WorkflowServices {
  return { reporter: NOOP_RUNBOOK_REPORTER };
}
