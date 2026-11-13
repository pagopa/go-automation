import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogger } from '@pagopa/go-common/logging';
import { ConsoleRunbookReporter } from '../../../../../../engine/reporting/ConsoleRunbookReporter.js';
import { ApiGwReporter } from '../ApiGwReporter.js';

/**
 * Minimal `GOLogger` stand-in that captures `text()` and `newline()`
 * emissions so tests can inspect the rendered banner content without
 * a real logger pipeline.
 */
function captureLogger(): { logger: GOLogger; narrative: ConsoleRunbookReporter; lines: string[] } {
  const lines: string[] = [];
  const logger = {
    text: (msg: string) => lines.push(msg),
    newline: () => lines.push(''),
  } as unknown as GOLogger;
  return { logger, narrative: new ConsoleRunbookReporter(logger), lines };
}

describe('ApiGwReporter', () => {
  describe('sectionPrepare', () => {
    it('renders the preparation banner with the log group', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).sectionPrepare('/aws/apigw/main');
      narrative.flush();
      assert.ok(lines.some((l) => l === '═══ Preparazione: query API Gateway ═══'));
      narrative.flush();
      assert.ok(lines.some((l) => l.includes('Log group: /aws/apigw/main')));
    });
  });

  describe('apiGwResult', () => {
    it('renders error count, endpoint, error message and trace id when all are present', () => {
      const { narrative, lines } = captureLogger();
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
      const { narrative, lines } = captureLogger();
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
      const { narrative, lines } = captureLogger();
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
      const { narrative, lines } = captureLogger();
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
    it('renders a "Query fallita" banner with the log group and the cause', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).queryFailed(
        ['/aws/ecs/pn-data-vault-sep'],
        "Log group '/aws/ecs/pn-data-vault-sep' does not exist for account ID '000000000902'",
      );
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /⚠ Query fallita/);
      assert.match(joined, /Log group: \/aws\/ecs\/pn-data-vault-sep/);
      assert.match(joined, /Causa: Log group '\/aws\/ecs\/pn-data-vault-sep' does not exist/);
    });

    it('uses the plural form when multiple log groups are passed', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).queryFailed(['/a', '/b'], 'AccessDenied');
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Log groups: \/a, \/b/);
      assert.match(joined, /Causa: AccessDenied/);
    });
  });

  describe('apiGwExecutionLog', () => {
    it('renders execution-log requestIds and result count', () => {
      const { narrative, lines } = captureLogger();
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

    it('reports an execution-log query skipped before reaching AWS', () => {
      const { narrative, lines } = captureLogger();
      const reporter = new ApiGwReporter(narrative);
      reporter.sectionApiGwExecutionLog();
      reporter.apiGwExecutionLogSkipped('API-Gateway-Execution-Logs_test/prod', 'over the limit of 1');

      narrative.flush();

      const joined = lines.join('\n');
      assert.match(joined, /Verifica execution log API Gateway/);
      assert.match(joined, /Query execution log non eseguita/);
      assert.match(joined, /API-Gateway-Execution-Logs_test\/prod/);
      assert.match(joined, /over the limit of 1/);
    });
  });
});
