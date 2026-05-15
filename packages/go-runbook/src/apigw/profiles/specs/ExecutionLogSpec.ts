/**
 * Specification della capability ExecutionLog. Opzionale.
 *
 * Presente in profili come SEND, che hanno API Gateway REST con log di
 * esecuzione separati interrogabili per `requestId`. Assente in profili
 * come INTEROP, che non hanno questo livello.
 *
 * Quando il profilo non ha `executionLog`, gli step
 * `query-api-gw-execution-logs` e `stop-api-gw-execution-log-unresolved`
 * non vengono cablati nella pipeline.
 *
 * V04: la query è eseguita **una sola volta** per tutti i requestId
 * raccolti (filter clause OR-combinata), invece di N chiamate AWS
 * separate. Il numero massimo di requestId combinati è limitato da
 * {@link maxRequestIds} come safety net contro query troppo lunghe.
 */
export interface ExecutionLogSpec {
  /**
   * Template della query sull'execution log.
   * Deve contenere `{{REQUEST_ID_FILTER_CLAUSE}}`, sostituito a runtime
   * con un predicate OR-clause su tutti i requestId estratti.
   *
   * SEND:
   * ```
   * {{REQUEST_ID_FILTER_CLAUSE}}
   * | sort @timestamp asc
   * | display @timestamp, @message
   * ```
   */
  readonly queryTemplate: string;

  /**
   * Template del predicate per singolo requestId, combinato in OR per
   * generare `{{REQUEST_ID_FILTER_CLAUSE}}`.
   * Deve contenere `{{VALUE}}`.
   *
   * SEND: `"@message like '{{VALUE}}'"`.
   */
  readonly requestIdPredicateTemplate: string;

  /**
   * Massimo numero di requestId combinati nella OR clause della query
   * singola. CloudWatch Logs Insights ha limiti pratici sulla lunghezza
   * della query; questo limite agisce come safety net contro richieste
   * che AWS rifiuterebbe.
   *
   * Default consigliato: `50`.
   *
   * Se il numero di requestId estratti dal AccessLog eccede questo limite,
   * lo step restituisce `success: false` con messaggio diagnostico. Il
   * limite può essere superato consapevolmente impostando un override in
   * `ApiGwAlarmConfig.executionLogMaxRequestIds`.
   */
  readonly maxRequestIds: number;
}
