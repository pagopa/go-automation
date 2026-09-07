import type { CaseAction } from '../../../actions/CaseAction.js';
import { unknownCaseFallback, UNKNOWN_CASE_TITLE } from '../../../actions/unknownCaseFallback.js';
import type { InteropApiGwAlarmConfig } from '../types/InteropApiGwAlarmConfig.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises the evidence the INTEROP API Gateway pipeline collected.
 *
 * @param config - The alarm configuration being assembled
 * @returns A warning {@link CaseAction}
 */
export function defaultInteropApiGwUnknownCaseFallback(config: InteropApiGwAlarmConfig): CaseAction {
  const { application, queryProfile } = config;
  return unknownCaseFallback(UNKNOWN_CASE_TITLE, [
    ['Ambiente', '{{vars.interopEnvironment}}'],
    ['API Gateway ID', '{{vars.interopApiGwId}}'],
    [`Errori ${queryProfile.errorFamilyLabel} API Gateway`, '{{vars.apiGwErrorCount}}'],
    [`Log applicativi ${application.serviceName}`, `{{vars.${application.varPrefix}LogCount}}`],
    ['CID estratti', `{{vars.${application.varPrefix}CidCount}}`],
    ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
  ]);
}
