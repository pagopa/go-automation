import { unknownCaseFallback, UNKNOWN_CASE_TITLE } from '../../actions/unknownCaseFallback.js';
import type { CaseAction } from '../../actions/CaseAction.js';
import type { ServiceDescriptor } from '../types/ServiceDescriptor.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises what the service log scan collected.
 *
 * @param service - Service under analysis
 * @returns A warning {@link CaseAction}
 */
export function defaultServiceUnknownCaseFallback(service: ServiceDescriptor): CaseAction {
  return unknownCaseFallback(UNKNOWN_CASE_TITLE, [
    ['Servizio', service.name],
    ['Log group', service.logGroup],
    ['Log errore', `{{vars.${service.varPrefix}LogCount}}`],
    ['Trace ID', `{{vars.${service.varPrefix}TraceId}}`],
    ['Log trace', `{{vars.${service.varPrefix}TraceLogCount}}`],
    ['Errore', `{{vars.${service.varPrefix}ErrorMsg}}`],
  ]);
}
