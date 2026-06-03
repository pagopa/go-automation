import type { CaseAction, LogAction } from '../../actions/CaseAction.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';

/**
 * Default fallback action used when the runbook author does not supply a
 * custom one. Produces a single warning summarising the collected vars,
 * with one line per declared downstream. Mirrors the API Gateway fallback.
 *
 * @param downstreams - Declared downstream microservices
 * @returns A warning {@link CaseAction}
 */
export function defaultLambdaUnknownCaseFallback(downstreams: ReadonlyArray<LambdaDownstream>): CaseAction {
  const lines: string[] = [
    "[CASO NON RICONOSCIUTO] Impossibile identificare univocamente la causa dell'errore.",
    'Lambda: {{vars.lambdaFunctionName}}',
    'Errori individuati: {{vars.lambdaErrorCount}}',
    'Categoria: {{vars.lambdaErrorCategory}}',
    'Runtime status: {{vars.lambdaRuntimeStatus}}',
    'requestId: {{vars.lambdaRequestId}}',
    'Downstream: {{vars.lambdaDownstreamTarget}}',
    'Esito tecnico: {{vars.terminationReason}}',
    'Ultimo errore: {{vars.lastErrorMsg}}',
  ];
  for (const downstream of downstreams) {
    lines.push(
      `${downstream.name}: msg={{vars.${downstream.varPrefix}ErrorMsg}}; logCount={{vars.${downstream.varPrefix}LogCount}}`,
    );
  }
  const action: LogAction = { type: 'log', level: 'warn', renderAs: 'unknown-case', message: lines.join('\n') };
  return action;
}
