/**
 * Schema dei campi prodotti dalla query AccessLog di un profilo API Gateway.
 *
 * Lo schema separa due assi:
 *
 * 1. **Campi semantici** (`traceIdField`, `errorMessageField`, `pathField`,
 *    `httpMethodField`, `requestIdField`): il "vocabolario" usato dai
 *    passi e dagli helper per dare significato ai campi della query.
 * 2. **Mapping verso le var di contesto** (`fieldToVar`): una semplice
 *    traduzione CloudWatch → contesto del runbook, usata da
 *    `ParseApiGwErrorsStep` per popolare `vars` con i valori del primo
 *    error row.
 *
 * Il "trace id" è un concetto generico: il nome del campo CloudWatch, la
 * label per la console e il nome della var di contesto sono tutti
 * configurabili per prodotto, così che SEND (`xrayTraceId`) e INTEROP
 * (`cid`) convivano nello stesso codice.
 */
export interface AccessLogSchema {
  /**
   * Campi di stato HTTP scansionati per decidere se una riga è in errore.
   * L'ordine determina la priorità in `pickPrimaryStatusCode`: il primo
   * campo numerico parsabile vince.
   *
   * SEND: `['status', 'authorizerStatus', 'integrationServiceStatus']`.
   */
  readonly statusFields: ReadonlyArray<string>;

  /**
   * Nome del campo CloudWatch che porta il trace id del prodotto.
   * SEND: `'xrayTraceId'`. INTEROP: `'cid'`.
   */
  readonly traceIdField: string;

  /**
   * Label human-friendly mostrata nei messaggi del reporter (es.
   * `'X-Ray Trace ID'` per SEND, `'Correlation ID (cid)'` per INTEROP).
   */
  readonly traceIdLabel: string;

  /**
   * Nome della var di contesto in cui scrivere il trace id estratto.
   * SEND: `'xRayTraceId'` (mantenuto per back-compat con i knownCases SEND
   * esistenti). INTEROP libero di usare `'traceId'` o `'cid'`.
   */
  readonly traceIdContextVar: string;

  /**
   * Regex opzionale per estrarre il valore "puro" del trace id quando il
   * campo è un wrapper. La prima capture group è il valore restituito; se
   * il pattern è assente o non matcha, viene restituito il valore raw del
   * campo.
   *
   * SEND: `'Root=([^\\s]+)'` (estrae `1-abc-def` da `Root=1-abc-def`).
   * INTEROP: tipicamente `undefined` (il `cid` è già raw).
   */
  readonly traceIdExtractPattern?: string;

  /** Nome del campo errorMessage. SEND: `'errorMessage'`. */
  readonly errorMessageField: string;

  /** Nome del campo path. SEND: `'path'`. */
  readonly pathField: string;

  /** Nome del campo http method. SEND: `'httpMethod'`. */
  readonly httpMethodField: string;

  /**
   * Nome del campo requestId. Usato dalla capability ExecutionLog per
   * estrarre i requestId dal AccessLog.
   * SEND: `'requestId'`.
   */
  readonly requestIdField: string;

  /**
   * Mapping fra campo CloudWatch e nome della var di contesto.
   *
   * Tipicamente include i campi semantici PIÙ alcuni accessori
   * (`authorizerStatus`, `authorizerLatency`,
   * `integrationServiceStatus`, `authorizerRequestId`,
   * `integrationRequestId` per SEND).
   */
  readonly fieldToVar: ReadonlyArray<readonly [field: string, contextVar: string]>;

  /**
   * Valori che indicano "campo non applicabile". Una riga il cui campo
   * status corrisponde a uno di questi viene ignorata in
   * `rowMeetsThreshold` e `pickPrimaryStatusCode`.
   *
   * SEND: `['-']`. Altri prodotti possono usare `['', 'N/A']`.
   */
  readonly notApplicableSentinels: ReadonlyArray<string>;

  /**
   * Campi opzionali usati dal gate authorizer Lambda. I profili che non
   * espongono questi valori possono lasciarlo undefined; un runbook che
   * abilita `authorizerFailureCheck` richiede invece questa capability.
   */
  readonly authorizer?: {
    /**
     * Campi CloudWatch che espongono lo status dell'authorizer Lambda.
     * L'ordine determina la priorita' in lettura: il primo valore
     * valorizzato e parsabile viene usato.
     */
    readonly statusFields: ReadonlyArray<string>;

    /**
     * Campi CloudWatch che espongono la latency dell'authorizer Lambda in ms.
     */
    readonly latencyFields: ReadonlyArray<string>;

    /**
     * Campi CloudWatch che espongono il request id dell'authorizer Lambda.
     */
    readonly requestIdFields: ReadonlyArray<string>;
  };
}
