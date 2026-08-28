import { unknownCaseFallback, type UnknownCaseRow } from '../../actions/unknownCaseFallback.js';
import type { CaseAction } from '../../actions/CaseAction.js';
import type { ApiGwService } from '../types/ApiGwService.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises the collected vars, with one row per analysed service.
 *
 * @param services - Services wired into the analysis loop
 * @param traceIdContextVar - Context var holding the product's trace id
 * @param traceIdLabel - Human-readable name of that trace id
 * @returns A warning {@link CaseAction}
 */
export function defaultUnknownCaseFallback(
  services: ReadonlyArray<ApiGwService>,
  traceIdContextVar: string,
  traceIdLabel: string,
): CaseAction {
  const serviceRows: ReadonlyArray<UnknownCaseRow> = services.map((service) => [
    service.name,
    `msg={{vars.${service.varPrefix}ErrorMsg}}; ` +
      `url={{vars.${service.varPrefix}NextUrl}}; ` +
      `target={{vars.${service.varPrefix}NextUrlTarget}}`,
  ]);

  return unknownCaseFallback("Impossibile identificare univocamente la causa dell'errore.", [
    ['Dettaglio', 'nessun caso noto ha soddisfatto le condizioni del runbook.'],
    ['Errori API Gateway', '{{vars.apiGwErrorCount}}'],
    ['Status API Gateway', '{{vars.apiGwStatusCode}}'],
    [traceIdLabel, `{{vars.${traceIdContextVar}}}`],
    ['Fallback UUID', '{{vars.fallbackUuid}}'],
    ['Esito tecnico', '{{vars.terminationReason}}'],
    ['Downstream', '{{vars.downstreamTarget}}'],
    ...serviceRows,
  ]);
}
