import { unknownErrorFallback, UNKNOWN_ERROR_TITLE } from '../../../analysis/reporting/unknownErrorFallback.js';
import type { CaseAction } from '../../../../../engine/index.js';
import type { ServiceDescriptor } from '../types/ServiceDescriptor.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises what the service log scan collected.
 *
 * @param service - Service under analysis
 * @returns A warning {@link CaseAction}
 */
export function defaultServiceUnknownErrorFallback(service: ServiceDescriptor): CaseAction {
  return unknownErrorFallback(UNKNOWN_ERROR_TITLE, [
    ['Servizio', service.name],
    ['Log group', service.logGroup],
    ['Log errore', `{{vars.${service.varPrefix}LogCount}}`],
    ['Trace ID', `{{vars.${service.varPrefix}TraceId}}`],
    ['Log trace', `{{vars.${service.varPrefix}TraceLogCount}}`],
    ['Errore', `{{vars.${service.varPrefix}ErrorMsg}}`],
  ]);
}
