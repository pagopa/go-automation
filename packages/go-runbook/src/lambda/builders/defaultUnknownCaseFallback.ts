import { unknownCaseFallback, type UnknownCaseRow } from '../../actions/unknownCaseFallback.js';
import type { CaseAction } from '../../actions/CaseAction.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises the collected vars, with one row per declared downstream.
 *
 * @param downstreams - Declared downstream microservices
 * @returns A warning {@link CaseAction}
 */
export function defaultLambdaUnknownCaseFallback(downstreams: ReadonlyArray<LambdaDownstream>): CaseAction {
  const downstreamRows: ReadonlyArray<UnknownCaseRow> = downstreams.map((downstream) => [
    downstream.name,
    `msg={{vars.${downstream.varPrefix}ErrorMsg}}; logCount={{vars.${downstream.varPrefix}LogCount}}`,
  ]);

  return unknownCaseFallback("Impossibile identificare univocamente la causa dell'errore.", [
    ['Lambda', '{{vars.lambdaFunctionName}}'],
    ['Errori individuati', '{{vars.lambdaErrorCount}}'],
    ['Categoria', '{{vars.lambdaErrorCategory}}'],
    ['Runtime status', '{{vars.lambdaRuntimeStatus}}'],
    ['requestId', '{{vars.lambdaRequestId}}'],
    ['Downstream', '{{vars.lambdaDownstreamTarget}}'],
    ['Esito tecnico', '{{vars.terminationReason}}'],
    ['Ultimo errore', '{{vars.lastErrorMsg}}'],
    ...downstreamRows,
  ]);
}
