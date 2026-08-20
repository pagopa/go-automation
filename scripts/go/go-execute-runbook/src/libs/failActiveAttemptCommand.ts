import { Core } from '@go-automation/go-common';

import type { FailExecutionRequest } from '@go-automation/go-watchtower-client';

import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';

/** Status che non indicano un rifiuto permanente del callback. */
const REAUTHENTICABLE_STATUS = 401;
const TRANSIENT_STATUS: ReadonlySet<number> = new Set([408, 429]);
/** Il 409 è un conflitto tipizzato del contratto, gestito nel flusso normale. */
const TYPED_CONFLICT_STATUS = 409;

/**
 * Riconosce un rifiuto **permanente** del callback da parte di Watchtower.
 *
 * Solo un 4xx che non sia rinegoziabile (401), transitorio (408/429) o già
 * modellato dal contratto (409). Un 5xx non entra: è un guasto lato server e
 * merita il retry prudente di SQS, non la chiusura dell'esecuzione.
 *
 * @param error - Errore sollevato dalla chiamata di callback
 */
export function isPermanentCallbackRejection(error: unknown): boolean {
  if (!(error instanceof Core.GOHttpClientError)) return false;
  const status = error.statusCode;
  if (status === undefined) return false;
  if (status < 400 || status >= 500) return false;
  return status !== REAUTHENTICABLE_STATUS && status !== TYPED_CONFLICT_STATUS && !TRANSIENT_STATUS.has(status);
}

/**
 * Chiude l'attempt attivo quando Watchtower rifiuta il callback di completamento.
 *
 * Si applica **solo** al `complete`: se il worker ha finito il lavoro ma il
 * callback viene respinto in modo permanente, riconsegnare il messaggio
 * rieseguirebbe all'infinito un runbook già andato a buon fine. Chiudere
 * l'attempt con una causa esplicita è l'unico esito che non consuma risorse a
 * vuoto e resta diagnosticabile (§5.3).
 *
 * **Il cancel-ack è escluso di proposito**: durante una cancellazione
 * l'esecuzione è `CANCEL_REQUESTED` e `decideFail` risponde
 * `CANCELLATION_REQUESTED`; un ack non confermabile resta un retry prudente di
 * SQS e, oltre la deadline, lo chiude il finalizer di sistema. Una cancellazione
 * non deve mai diventare una failure.
 *
 * @param deps - Dipendenze del worker, per il client Watchtower
 * @param executionId - Esecuzione il cui attempt va chiuso
 * @param attemptId - Attempt attivo che ha tentato il callback
 * @param cause - Errore che ha causato il rifiuto
 * @param deadlineAtMs - Scadenza entro cui inviare il fail
 * @returns `true` se il fail è stato accettato; `false` lascia il retry a SQS
 */
export async function failActiveAttemptCommand(
  deps: ExecuteRunbookDeps,
  executionId: string,
  attemptId: string,
  cause: unknown,
  deadlineAtMs: number,
): Promise<boolean> {
  const request: FailExecutionRequest = {
    scope: 'ACTIVE_ATTEMPT',
    attemptId,
    errorCategory: 'CALLBACK',
    errorCode: 'WORKER_CALLBACK_REJECTED',
    errorMessage: boundedMessage(cause),
    failedPhase: 'COMPLETE_CALLBACK',
    retryable: false,
  };
  try {
    const result = await deps.watchtower.failExecution(executionId, request, {
      idempotencyKey: `fail:${executionId}:${attemptId}:WORKER_CALLBACK_REJECTED`,
      deadlineAtMs,
    });
    // Anche il fail può non essere confermabile (es. cancellazione in corso):
    // in quel caso non si insiste, si lascia decidere al retry di SQS.
    return !('conflict' in result);
  } catch {
    return false;
  }
}

function boundedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Watchtower rejected the completion callback: ${message}`.slice(0, 2_048);
}
