import type { KnownCase } from '../../types/KnownCase.js';
import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';

export function builtinApiGwAuthorizerKnownCases(config: ApiGwAlarmConfig): ReadonlyArray<KnownCase> {
  if (config.authorizerFailureCheck === undefined) return [];
  return [
    {
      id: 'api-gw-authorizer-timeout',
      description: 'Timeout Lambda authorizer API Gateway',
      priority: 10_000,
      condition: { type: 'compare', ref: 'vars.apiGwAuthorizerOutcome', operator: '==', value: 'timeout' },
      action: {
        type: 'log',
        level: 'info',
        renderAs: 'known-case',
        message:
          '[CASO NOTO] Timeout Lambda authorizer API Gateway\n' +
          'Lambda: {{vars.apiGwAuthorizerLambdaName}}\n' +
          'Dettaglio: {{vars.lastErrorMsg}}\n' +
          'authorizerRequestId: {{vars.apiGwAuthorizerRequestId}}\n' +
          'Endpoint: {{vars.apiGwAuthorizerHttpMethod}} {{vars.apiGwAuthorizerPath}}',
      },
    },
    {
      id: 'api-gw-authorizer-error',
      description: 'Errore Lambda authorizer API Gateway',
      priority: 9_999,
      condition: { type: 'compare', ref: 'vars.apiGwAuthorizerOutcome', operator: '==', value: 'error' },
      action: {
        type: 'log',
        level: 'info',
        renderAs: 'known-case',
        message:
          '[CASO NOTO] Errore Lambda authorizer API Gateway\n' +
          'Lambda: {{vars.apiGwAuthorizerLambdaName}}\n' +
          'Dettaglio: {{vars.lastErrorMsg}}\n' +
          'authorizerRequestId: {{vars.apiGwAuthorizerRequestId}}\n' +
          'Endpoint: {{vars.apiGwAuthorizerHttpMethod}} {{vars.apiGwAuthorizerPath}}',
      },
    },
  ];
}
