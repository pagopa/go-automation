import type { CaseAction, LogActionRow } from '../../actions/CaseAction.js';
import { unknownCaseFallback, UNKNOWN_CASE_TITLE } from '../../actions/unknownCaseFallback.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';

/**
 * Default fallback used when the runbook author does not supply one.
 * Summarises the collected vars, with one row per declared downstream.
 *
 * @param downstreams - Declared downstream microservices
 * @returns A warning {@link CaseAction}
 */
export function defaultLambdaUnknownCaseFallback(downstreams: ReadonlyArray<LambdaDownstream>): CaseAction {
  // One row per aspect: a single compound row would survive the
  // unavailable-row filter even when every part of it is missing.
  const downstreamRows: ReadonlyArray<LogActionRow> = downstreams.flatMap((downstream) => [
    [`${downstream.name} — errore`, `{{vars.${downstream.varPrefix}ErrorMsg}}`],
    [`${downstream.name} — log`, `{{vars.${downstream.varPrefix}LogCount}}`],
  ]);

  return unknownCaseFallback(UNKNOWN_CASE_TITLE, [
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
