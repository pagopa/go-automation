export interface ApiGwAuthorizerLambdaConfig {
  readonly lambdaName: string;
  readonly timeoutMs: number;
}

export type ApiGwAuthorizerLambdaName =
  | 'pn-ApiKeyAuthorizerV2Lambda'
  | 'pn-backofficeAuthorizerLambda'
  | 'pn-lollipopAuthorizerLambda'
  | 'pn-ioAuthorizerLambda'
  | 'pn-b2bAuthorizerLambda'
  | 'pn-jwtAuthorizerLambda';

export const API_GW_AUTHORIZER_LAMBDAS: Readonly<Record<ApiGwAuthorizerLambdaName, ApiGwAuthorizerLambdaConfig>> = {
  'pn-ApiKeyAuthorizerV2Lambda': {
    lambdaName: 'pn-ApiKeyAuthorizerV2Lambda',
    timeoutMs: 10_000,
  },
  'pn-backofficeAuthorizerLambda': {
    lambdaName: 'pn-backofficeAuthorizerLambda',
    timeoutMs: 3_000,
  },
  'pn-lollipopAuthorizerLambda': {
    lambdaName: 'pn-lollipopAuthorizerLambda',
    timeoutMs: 15_000,
  },
  'pn-ioAuthorizerLambda': {
    lambdaName: 'pn-ioAuthorizerLambda',
    timeoutMs: 5_000,
  },
  'pn-b2bAuthorizerLambda': {
    lambdaName: 'pn-b2bAuthorizerLambda',
    timeoutMs: 25_000,
  },
  'pn-jwtAuthorizerLambda': {
    lambdaName: 'pn-jwtAuthorizerLambda',
    timeoutMs: 5_000,
  },
};

export function getApiGwAuthorizerLambdaConfig(name: ApiGwAuthorizerLambdaName): ApiGwAuthorizerLambdaConfig {
  return API_GW_AUTHORIZER_LAMBDAS[name];
}
