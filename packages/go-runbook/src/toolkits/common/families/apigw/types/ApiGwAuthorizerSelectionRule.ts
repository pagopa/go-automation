import type { ApiGwAuthorizerLambdaConfig } from './ApiGwAuthorizerLambdaConfig.js';

/** Associates the AccessLog rows of a path (and method) with an authorizer Lambda. */
export interface ApiGwAuthorizerSelectionRule {
  /**
   * Authorizer Lambda da associare alle righe AccessLog che matchano la
   * regola. Il valore arriva dalla tabella degli authorizer del prodotto.
   */
  readonly authorizer: ApiGwAuthorizerLambdaConfig;
  /** Prefix del path API Gateway a cui applicare la regola. */
  readonly pathPrefix?: string;
  /** Metodo HTTP opzionale a cui restringere la regola. */
  readonly httpMethod?: string;
}
