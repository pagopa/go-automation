import { escapeSqlString } from '../../../steps/data/interpolateTemplate.js';

/**
 * Opzioni per {@link renderQueryTemplate}.
 *
 * Tutti i placeholder elencati in `values` sono automaticamente considerati
 * required: se il template non li contiene, l'invocazione throwa con un
 * messaggio diagnostico (evita il silent no-op del `split().join()` su
 * placeholder assente). Per sopprimere il check su uno specifico
 * placeholder, includerlo in `optional`.
 */
export interface RenderQueryTemplateOptions {
  /**
   * Mapping placeholder → valore. Ogni chiave deve esistere nel template
   * almeno una volta, altrimenti viene lanciato un errore. Per
   * soppressione esplicita usare {@link RenderQueryTemplateOptions.optional}.
   */
  readonly values: Readonly<Record<string, string>>;

  /**
   * Placeholder per cui sopprimere il check di presenza. Utile per
   * sostituzioni di tipo "best-effort" che non devono fallire quando il
   * template non li menziona.
   */
  readonly optional?: ReadonlyArray<string>;

  /**
   * Strategia di escape applicata ai valori prima della sostituzione.
   * - `'none'` (default): valore inserito as-is.
   * - `'sql'`: applica {@link escapeSqlString} (raddoppia gli apici singoli
   *   e rimuove i null byte).
   */
  readonly escape?: 'none' | 'sql';

  /**
   * Identificatore della query usato nei messaggi di errore. Es.
   * `'send.accessLog'`, `'send.serviceLog.tracePredicate'`.
   */
  readonly queryId?: string;
}

/**
 * Sostituisce i placeholder di un template di query CloudWatch Logs Insights.
 *
 * Centralizza le sostituzioni che oggi vivono sparse fra
 * `createApiGwAlarmRunbook`, `QueryServiceLogsStep` e
 * `QueryApiGwExecutionLogsStep`. Un solo point of failure (check di
 * presenza) e un solo point of escape (`escape: 'sql'`).
 *
 * Complessità: O(T·V) dove T è la lunghezza del template e V il numero di
 * placeholder. Nessun parser regex nel hot path.
 *
 * @param template - template della query con i placeholder da sostituire
 * @param options - mapping di sostituzione + opzioni di check/escape
 * @returns la query risolta
 *
 * @example
 * ```typescript
 * const query = renderQueryTemplate(
 *   'filter status >= {{minStatusCode}} | sort @timestamp asc',
 *   {
 *     values: { '{{minStatusCode}}': '500' },
 *     queryId: 'send.accessLog',
 *   },
 * );
 *
 * const filtered = renderQueryTemplate(
 *   "filter @message like '{{VALUE}}'",
 *   {
 *     values: { '{{VALUE}}': "O'Brien" },
 *     escape: 'sql',
 *     queryId: 'send.serviceLog.tracePredicate',
 *   },
 * );
 * // → "filter @message like 'O''Brien'"
 * ```
 */
export function renderQueryTemplate(template: string, options: RenderQueryTemplateOptions): string {
  const optional = new Set(options.optional ?? []);
  for (const placeholder of Object.keys(options.values)) {
    if (optional.has(placeholder)) continue;
    if (!template.includes(placeholder)) {
      const where = options.queryId !== undefined ? ` ("${options.queryId}")` : '';
      throw new Error(
        `renderQueryTemplate${where}: template is missing required placeholder "${placeholder}". ` +
          `Without it the substitution would be a silent no-op and the query would carry the literal token.`,
      );
    }
  }

  const escape = options.escape ?? 'none';
  let result = template;
  for (const [placeholder, value] of Object.entries(options.values)) {
    const escapedValue = escape === 'sql' ? escapeSqlString(value) : value;
    result = result.split(placeholder).join(escapedValue);
  }
  return result;
}
