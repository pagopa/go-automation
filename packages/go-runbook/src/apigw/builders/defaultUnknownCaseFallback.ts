import type { CaseAction, LogAction } from '../../actions/CaseAction.js';
import type { ApiGwService } from '../types/ApiGwService.js';

/**
 * Default fallback action used when the runbook author does not supply a
 * custom one. Produces a single warning action summarising the collected
 * vars, with one line per analysed service.
 */
export function defaultUnknownCaseFallback(
  services: ReadonlyArray<ApiGwService>,
  traceIdContextVar: string,
  traceIdLabel: string,
): CaseAction {
  const lines: string[] = [
    "[CASO NON RICONOSCIUTO] Impossibile identificare univocamente la causa dell'errore.",
    'Dettaglio: nessun caso noto ha soddisfatto le condizioni del runbook.',
    'Errori API Gateway: {{vars.apiGwErrorCount}}',
    'Status API Gateway: {{vars.apiGwStatusCode}}',
    `${traceIdLabel}: {{vars.${traceIdContextVar}}}`,
    'Fallback UUID: {{vars.fallbackUuid}}',
    'Esito tecnico: {{vars.terminationReason}}',
    'Downstream: {{vars.downstreamTarget}}',
  ];
  for (const service of services) {
    lines.push(
      `${service.name}: msg={{vars.${service.varPrefix}ErrorMsg}}; ` +
        `url={{vars.${service.varPrefix}NextUrl}}; ` +
        `target={{vars.${service.varPrefix}NextUrlTarget}}`,
    );
  }
  const action: LogAction = { type: 'log', level: 'warn', renderAs: 'unknown-case', message: lines.join('\n') };
  return action;
}
