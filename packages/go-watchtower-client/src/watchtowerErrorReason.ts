import { Core } from '@go-automation/go-common';

/** Bound del motivo riportato nel messaggio: la diagnosi sta in testa, non il dump del corpo. */
const MAX_REASON_LENGTH = 300;

/**
 * Campi con cui Watchtower veicola la causa di un errore applicativo.
 *
 * È una convenzione **di questo server**, ed è la ragione per cui questa
 * funzione vive qui e non nel client HTTP generico: `GOHttpClient` non può
 * sapere come un servizio specifico struttura i propri errori, e infatti espone
 * già il corpo in `GOHttpClientError.response` proprio perché sia il chiamante a
 * interpretarlo.
 */
const REASON_FIELDS = ['error', 'message', 'detail'] as const;

/**
 * Estrae dal corpo della risposta la causa che Watchtower ha già spiegato.
 *
 * @param error - Errore sollevato da `GOHttpClient`
 * @returns Il motivo leggibile, o `undefined` se il corpo non ne porta uno
 */
export function watchtowerErrorReason(error: Core.GOHttpClientError): string | undefined {
  // `response` è il corpo già deserializzato quando il content-type è JSON,
  // la stringa grezza altrimenti: entrambi possono portare la causa.
  const body = typeof error.response === 'string' ? parseJsonObject(error.response) : error.response;
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as Record<string, unknown>;
  for (const field of REASON_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim().slice(0, MAX_REASON_LENGTH);
    }
  }
  return undefined;
}

/**
 * Riscrive l'errore includendo nel messaggio la causa riportata da Watchtower.
 *
 * Senza, un errore con causa nota — «catalogo scaduto», «riferimento non
 * censito» — arriva a chi legge come il solo status HTTP, e la spiegazione resta
 * in `response`, che quasi nessun chiamante ispeziona.
 *
 * Restituisce un `GOHttpClientError` con gli stessi campi, non un tipo nuovo:
 * i chiamanti classificano gli esiti su `statusCode` e su `instanceof`, e
 * cambiare il tipo dell'errore romperebbe quelle decisioni.
 *
 * @param error - Errore da arricchire; qualunque altro valore torna invariato
 * @returns L'errore con il messaggio esplicativo, o il valore originale
 */
export function withWatchtowerReason(error: unknown): unknown {
  if (!(error instanceof Core.GOHttpClientError)) return error;
  const reason = watchtowerErrorReason(error);
  if (reason === undefined || error.message.includes(reason)) return error;
  return new Core.GOHttpClientError(
    `${error.message} — ${reason}`,
    error.statusCode,
    error.response,
    error.attemptsUsed,
    error.retryAfterMs,
  );
}

function parseJsonObject(raw: string): unknown {
  if (raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // Corpo non JSON (l'HTML di un proxy, testo libero): non è una diagnosi
    // affidabile e allungherebbe il messaggio senza informare.
    return undefined;
  }
}
