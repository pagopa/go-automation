/** An API Gateway authorizer Lambda: name and configured timeout. Products declare their own table. */
export interface ApiGwAuthorizerLambdaConfig {
  readonly lambdaName: string;
  readonly timeoutMs: number;
}
