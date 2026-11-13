import { RunbookMissingServicesError } from '../errors/RunbookMissingServicesError.js';
import type { Runbook } from '../types/Runbook.js';
import type { ServiceCapabilityCheck } from '../types/ServiceCapabilityCheck.js';
import type { WorkflowServices } from '../types/WorkflowServices.js';
import { collectRunbookSteps } from './collectRunbookSteps.js';

/**
 * Rejects an execution whose services cannot serve the steps of the runbook,
 * before any step runs. A required service must be present (not `null` or
 * `undefined`) and, when a predicate is given for it, pass the predicate.
 *
 * @param runbook - Runbook about to run
 * @param services - Services received by the execution
 * @param capabilities - Capability predicates by service name
 * @throws RunbookMissingServicesError listing every unusable service
 */
export function assertRequiredServices(
  runbook: Runbook,
  services: WorkflowServices,
  capabilities: ServiceCapabilityCheck = {},
): void {
  const required = new Set<string>();
  for (const step of collectRunbookSteps(runbook)) {
    for (const name of step.requiredServices?.() ?? []) required.add(name);
  }
  const received = services as unknown as Readonly<Record<string, unknown>>;
  const missing = [...required].filter((name) => {
    const service = received[name];
    if (service === undefined || service === null) return true;
    const predicate = capabilities[name];
    return predicate !== undefined && !predicate(service);
  });
  if (missing.length > 0) throw new RunbookMissingServicesError(runbook.metadata.id, missing.toSorted());
}
