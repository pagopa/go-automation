import {
  unknownErrorFallback,
  UNKNOWN_ERROR_TITLE,
} from '../../../../common/analysis/reporting/unknownErrorFallback.js';
import type { CaseAction } from '../../../../../engine/index.js';
import type { InteropK8sServiceDescriptor } from '../types/InteropK8sServiceDescriptor.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises the INTEROP k8s evidence collected for the service.
 *
 * @param service - Service under analysis
 * @returns A warning {@link CaseAction}
 */
export function defaultInteropK8sUnknownErrorFallback(service: InteropK8sServiceDescriptor): CaseAction {
  return unknownErrorFallback(UNKNOWN_ERROR_TITLE, [
    ['Ambiente', '{{vars.interopEnvironment}}'],
    ['Log group', '{{vars.interopLogGroup}}'],
    ['Servizio', '{{vars.interopPodApp}}'],
    ['Log applicativi', `{{vars.${service.varPrefix}LogCount}}`],
    ['CID estratti', `{{vars.${service.varPrefix}CidCount}}`],
    ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
  ]);
}
