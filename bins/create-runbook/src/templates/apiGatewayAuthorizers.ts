/**
 * Lambda authorizer keys available in `apigw.API_GW_AUTHORIZER_LAMBDAS`
 * (see packages/go-runbook). Kept in sync manually: the scaffolder only
 * needs the string keys to emit into the generated runbook.
 */
export const API_GW_AUTHORIZER_NAMES: ReadonlyArray<string> = [
  'pn-ApiKeyAuthorizerV2Lambda',
  'pn-backofficeAuthorizerLambda',
  'pn-lollipopAuthorizerLambda',
  'pn-ioAuthorizerLambda',
  'pn-b2bAuthorizerLambda',
  'pn-jwtAuthorizerLambda',
];
