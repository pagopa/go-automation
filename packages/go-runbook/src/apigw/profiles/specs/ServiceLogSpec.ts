import type { ServiceLogSchema } from '../schemas/ServiceLogSchema.js';

/**
 * Specification della capability ServiceLog. Obbligatoria: ogni runbook
 * API GW deve poter interrogare almeno i log del microservizio di entry.
 *
 * I predicate template separati (`tracePredicateTemplate`,
 * `fallbackPredicateTemplate`) permettono ai profili di scegliere il
 * filtro più efficiente per il proprio formato di log: SEND scansiona
 * `@message` con `like`, INTEROP può filtrare su campi strutturati
 * (`trace_id = '<value>'`).
 *
 * Nota sull'override: `ApiGwService.queryOverride` (vedi
 * `types/ApiGwService.ts`) può sovrascrivere SOLO `queryTemplate`. I
 * predicate template sono di proprietà del profilo e NON sono
 * sovrascrivibili a livello di servizio: rappresentano il formato dei log
 * applicativi del prodotto, che è uniforme per definizione.
 */
export interface ServiceLogSpec {
  /**
   * Template della query CloudWatch Logs Insights sui log applicativi.
   * Deve contenere il placeholder `{{FILTER_CLAUSE}}`, sostituito a
   * runtime con il predicate generato (vedi `tracePredicateTemplate` /
   * `fallbackPredicateTemplate`) o con stringa vuota se nessun
   * identificatore è disponibile.
   */
  readonly queryTemplate: string;

  /**
   * Template del predicate da iniettare in `{{FILTER_CLAUSE}}` quando
   * l'identificatore attivo è uno X-Ray trace id.
   * Deve contenere il placeholder `{{VALUE}}`, sostituito (con escape SQL)
   * dal valore del trace id.
   *
   * SEND: `"@message like '{{VALUE}}'"`.
   * INTEROP: `"trace_id = '{{VALUE}}'"` (campo strutturato).
   */
  readonly tracePredicateTemplate: string;

  /**
   * Template del predicate quando l'identificatore attivo è un fallback UUID.
   * Stessa forma di `tracePredicateTemplate`.
   */
  readonly fallbackPredicateTemplate: string;

  /** Schema dei campi dei log applicativi (per gli helper di analisi). */
  readonly schema: ServiceLogSchema;
}
