/**
 * Schema dei campi dei log applicativi di un servizio.
 *
 * Usato dagli step `service` per leggere log in formati prodotto-specifici
 * senza legare il builder a un'origine allarme specifica.
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
