/**
 * Schema dei campi dei log applicativi di un microservizio.
 *
 * Usato dagli helper di analisi (`findErrorMessage`, `extractFallbackUuid`,
 * `findKnownUrlInLogs`, `findTraceIdCandidate`) per leggere i log nel
 * formato specifico del prodotto.
 */
export interface ServiceLogSchema {
  /**
   * Nomi alternativi del campo "message" in ordine di precedenza.
   * SEND: `['message', '@message']`. Il primo che esiste nella riga vince.
   */
  readonly messageFieldCandidates: ReadonlyArray<string>;

  /** Nome del campo livello di log. SEND: `'level'`. */
  readonly levelField: string;

  /** Nome del campo trace id applicativo. SEND: `'trace_id'`. */
  readonly traceIdField: string;
}
