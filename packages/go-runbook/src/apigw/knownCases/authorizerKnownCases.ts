import type { KnownCase } from '../../types/KnownCase.js';
import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';

/**
 * Resolutions of the built-in cases, injected into every API Gateway runbook.
 *
 * They stay product-agnostic on purpose: this function is shared, while the
 * downstream catalogs are per product, so no catalog value belongs here.
 */
const TIMEOUT_RESOLUTION =
  "Timeout del Lambda authorizer di API Gateway. Verificare la durata e la disponibilità dell'authorizer indicato.";
const ERROR_RESOLUTION =
  "Errore del Lambda authorizer di API Gateway. Verificare il dettaglio dell'errore e l'authorizerRequestId nei log dell'authorizer.";

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
      analysis: {
        resolution: TIMEOUT_RESOLUTION,
        // Un timeout dell'authorizer va sempre guardato: non si chiude da solo.
        proposedStatus: 'IN_PROGRESS',
        analysisType: 'ANALYZABLE',
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
      analysis: {
        resolution: ERROR_RESOLUTION,
        proposedStatus: 'IN_PROGRESS',
        analysisType: 'ANALYZABLE',
      },
    },
  ];
}
