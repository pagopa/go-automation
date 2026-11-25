import type { ApiGwAuthorizerLambdaConfig } from './ApiGwAuthorizerLambdaConfig.js';
import type { ApiGwAuthorizerSelectionRule } from './ApiGwAuthorizerSelectionRule.js';

/** How an API Gateway runbook recognises authorizer failures in the AccessLog. */
export interface ApiGwAuthorizerFailureCheckConfig {
  /**
   * Authorizer usato quando nessuna regola specifica matcha la riga
   * AccessLog. Sufficiente per runbook con un solo authorizer.
   */
  readonly defaultAuthorizer?: ApiGwAuthorizerLambdaConfig;
  /**
   * Regole opzionali per API Gateway che usano authorizer diversi in
   * base a path/metodo. Sono valutate nell'ordine dichiarato.
   */
  readonly rules?: ReadonlyArray<ApiGwAuthorizerSelectionRule>;
  /**
   * Soglia minima status authorizer considerata errore. Default `500`.
   */
  readonly statusThreshold?: number;
}
