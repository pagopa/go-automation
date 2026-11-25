import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ApiGwReporter } from '../ApiGwReporter.js';
import { captureNarrative } from '../../../../../../__tests__/helpers/captureNarrative.js';

describe('ApiGwReporter', () => {
  describe('sectionPrepare', () => {
    it('renders the preparation banner with the log group', () => {
      const { reporter: narrative, lines } = captureNarrative();
      new ApiGwReporter(narrative).sectionPrepare('/aws/apigw/main');
      narrative.flush();
      assert.ok(lines.some((l) => l === '═══ Preparazione: query API Gateway ═══'));
      assert.ok(lines.some((l) => l.includes('Log group: /aws/apigw/main')));
    });
  });

  describe('apiGwResult', () => {
    it('renders error count, endpoint, error message and trace id when all are present', () => {
      const { reporter: narrative, lines } = captureNarrative();
      new ApiGwReporter(narrative).apiGwResult({
        errorCount: 3,
        statusCode: '500',
        traceId: '1-abc-def',
        traceIdLabel: 'X-Ray Trace ID',
        errorMessage: 'Endpoint request timed out',
        path: '/v1/foo',
        httpMethod: 'POST',
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Errori HTTP individuati: 3 \(status 500\)/);
      assert.match(joined, /Endpoint: POST \/v1\/foo/);
      assert.match(joined, /Error message API GW: Endpoint request timed out/);
      assert.match(joined, /X-Ray Trace ID: 1-abc-def/);
    });

    it('skips endpoint/error-message rows when only the API GW `-` placeholder is present', () => {
      const { reporter: narrative, lines } = captureNarrative();
      new ApiGwReporter(narrative).apiGwResult({
        errorCount: 1,
        statusCode: '504',
        traceId: undefined,
        traceIdLabel: 'X-Ray Trace ID',
        errorMessage: '-',
        path: '-',
        httpMethod: '-',
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.doesNotMatch(joined, /Endpoint:/);
      assert.doesNotMatch(joined, /Error message API GW:/);
      assert.match(joined, /X-Ray Trace ID: non disponibile/);
    });
  });

  describe('apiGwAuthorizerEvaluation', () => {
    it('renders authorizer fields and a no-failure outcome', () => {
      const { reporter: narrative, lines } = captureNarrative();
      new ApiGwReporter(narrative).apiGwAuthorizerEvaluation({
        lambdaName: 'pn-ioAuthorizerLambda',
        authorizerStatus: '200',
        authorizerLatencyMs: 12,
        authorizerRequestId: 'auth-1',
        timeoutMs: 5000,
        path: '/foo',
        httpMethod: 'PUT',
        outcome: 'none',
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Verifica Lambda authorizer API Gateway/);
      assert.match(joined, /authorizerStatus: 200/);
      assert.match(joined, /authorizerLatency: 12 ms/);
      assert.match(joined, /authorizerRequestId: auth-1/);
      assert.match(joined, /Esito: nessun errore authorizer/);
    });

    it('renders a generic authorizer error with unavailable latency explicit', () => {
      const { reporter: narrative, lines } = captureNarrative();
      new ApiGwReporter(narrative).apiGwAuthorizerEvaluation({
        lambdaName: 'pn-ioAuthorizerLambda',
        authorizerStatus: '503',
        authorizerRequestId: 'auth-2',
        timeoutMs: 5000,
        outcome: 'error',
        failureType: 'status-error',
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /authorizerStatus: 503/);
      assert.match(joined, /authorizerLatency: non disponibile/);
      assert.match(joined, /authorizerRequestId: auth-2/);
      assert.match(joined, /Esito: errore authorizer/);
    });
  });

  describe('queryFailed', () => {
    it('renders a "Query fallita" banner with the log group(s) and the cause', () => {
      const { reporter: narrative, lines } = captureNarrative();
      const reporter = new ApiGwReporter(narrative);
      reporter.queryFailed(
        ['/aws/ecs/pn-data-vault-sep'],
        "Log group '/aws/ecs/pn-data-vault-sep' does not exist for account ID '000000000902'",
      );
      reporter.queryFailed(['/a', '/b'], 'AccessDenied');
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /⚠ Query fallita/);
      assert.match(joined, /Log group: \/aws\/ecs\/pn-data-vault-sep/);
      assert.match(joined, /Causa: Log group '\/aws\/ecs\/pn-data-vault-sep' does not exist/);
      assert.match(joined, /Log groups: \/a, \/b/);
      assert.match(joined, /Causa: AccessDenied/);
    });
  });

  describe('apiGwExecutionLog', () => {
    it('renders execution-log requestIds and result count', () => {
      const { reporter: narrative, lines } = captureNarrative();
      const reporter = new ApiGwReporter(narrative);
      reporter.sectionApiGwExecutionLog();
      reporter.apiGwExecutionLogQuery('API-Gateway-Execution-Logs_test/prod', [
        { path: '/resource-a', requestId: 'req-a' },
        { path: '/resource-b', requestId: 'req-b' },
      ]);
      reporter.apiGwExecutionLogResult(12);
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Verifica execution log API Gateway/);
      assert.match(joined, /query execution log/);
      assert.match(joined, /API-Gateway-Execution-Logs_test\/prod/);
      assert.match(joined, /\/resource-a: req-a/);
      assert.match(joined, /Execution log trovati: 12/);
    });
  });
});
