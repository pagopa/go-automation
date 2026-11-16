import type { CaseAction, LogActionRow } from '../../../../../engine/types/CaseAction.js';
import { unknownCaseFallback, UNKNOWN_CASE_TITLE } from '../../../../common/analysis/reporting/unknownCaseFallback.js';
import type { ApiGwService } from '../../../../common/families/apigw/types/ApiGwService.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises the collected vars, with one row per analysed service.
 *
 * @param services - Services wired into the analysis loop
 * @param traceIdContextVar - Context var holding the product's trace id
 * @param traceIdLabel - Human-readable name of that trace id
 * @returns A warning {@link CaseAction}
 */
export function defaultSendApiGwUnknownCaseFallback(
  services: ReadonlyArray<ApiGwService>,
  traceIdContextVar: string,
  traceIdLabel: string,
): CaseAction {
  // One row per aspect: a single compound row would survive the
  // unavailable-row filter even when every part of it is missing.
  const serviceRows: ReadonlyArray<LogActionRow> = services.flatMap((service) => [
    [`${service.name} — errore`, `{{vars.${service.varPrefix}ErrorMsg}}`],
    [`${service.name} — url`, `{{vars.${service.varPrefix}NextUrl}}`],
    [`${service.name} — target`, `{{vars.${service.varPrefix}NextUrlTarget}}`],
  ]);

  return unknownCaseFallback(UNKNOWN_CASE_TITLE, [
    ['Errori API Gateway', '{{vars.apiGwErrorCount}}'],
    ['Status API Gateway', '{{vars.apiGwStatusCode}}'],
    [traceIdLabel, `{{vars.${traceIdContextVar}}}`],
    ['Fallback UUID', '{{vars.fallbackUuid}}'],
    ['Esito tecnico', '{{vars.terminationReason}}'],
    ['Downstream', '{{vars.downstreamTarget}}'],
    ...serviceRows,
  ]);
}
