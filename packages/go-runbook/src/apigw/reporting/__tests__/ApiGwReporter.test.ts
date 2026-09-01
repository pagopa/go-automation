import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogger } from '@go-automation/go-common/core';
import { ConsoleRunbookReporter } from '../../../services/reporters/ConsoleRunbookReporter.js';
import { ApiGwReporter, renderApiGwFinalSummary } from '../ApiGwReporter.js';

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

  describe('sectionService', () => {
    it('marks the entry service and includes the log group', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).sectionService(1, 'pn-user-attributes', true, ['/aws/ecs/pn-user-attributes']);
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /═══ Servizio 1: pn-user-attributes \(entry\) ═══/);
      assert.match(joined, /Log group: \/aws\/ecs\/pn-user-attributes/);
    });

    it('omits the entry tag for downstream services', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).sectionService(2, 'pn-external-registries', false, [
        '/aws/ecs/pn-external-registries',
      ]);
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /═══ Servizio 2: pn-external-registries ═══/);
      assert.doesNotMatch(joined, /\(entry\)/);
    });
  });

  describe('query / queryResult', () => {
    it('renders identifiers joined by OR when multiple are present', () => {
      const { narrative, lines } = captureLogger();
      const reporter = new ApiGwReporter(narrative);
      reporter.query(3, ['xRayTraceId=1-abc', 'fallbackUuid=fb-1']);
      reporter.queryResult(42);
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Query CloudWatch 3 \[filter: xRayTraceId=1-abc OR fallbackUuid=fb-1\]/);
      assert.match(joined, /42 log trovati/);
    });

    it('falls back to a textual placeholder when no identifiers are passed', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).query(1, []);
      narrative.flush();
      assert.ok(lines.some((l) => l.includes('nessun identificatore')));
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
        "Log group '/aws/ecs/pn-data-vault-sep' does not exist for account ID '510769970275'",
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

  describe('analysisFindings', () => {
    it('reports an error message, known URL and fresh fallback UUID when all surfaced', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).analysisFindings({
        errorMessageLen: 412,
        knownUrl: { observedUrl: 'http://internal/...', target: 'pn-external-registries' },
        fallbackUuid: '8f41cb6b-4a21-4c11-89f1-ee688423b7aa',
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Error message individuato \(len=412\)/);
      assert.match(joined, /KnownUrl rilevato → target: pn-external-registries/);
      assert.match(joined, /URL: http:\/\/internal\/\.\.\./);
      assert.match(joined, /FALLBACK-UUID estratto: 8f41cb6b-4a21-4c11-89f1-ee688423b7aa/);
    });

    it('renders "nessun error message" and "nessun FALLBACK-UUID nuovo" on empty findings', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).analysisFindings({ errorMessageLen: 0 });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Nessun error message rilevato/);
      assert.match(joined, /Nessun FALLBACK-UUID nuovo/);
    });
  });

  describe('decision methods', () => {
    it('decisionKnownCase prints the case id', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).decisionKnownCase('appio-cosmos-429');
      narrative.flush();
      assert.ok(lines.some((l) => l.includes('Match caso noto: appio-cosmos-429')));
    });

    it('decisionGoToService prints the target', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).decisionGoToService('pn-external-registries');
      narrative.flush();
      assert.ok(lines.some((l) => l.includes('Prosegue con il servizio: pn-external-registries')));
    });

    it('decisionExternalDownstream prints the downstream target', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).decisionExternalDownstream('AppIO');
      narrative.flush();
      assert.ok(lines.some((l) => l.includes('URL downstream individuato (AppIO)')));
    });

    it('decisionFallbackRetry prints the service to be re-queried', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).decisionFallbackRetry('pn-data-vault');
      narrative.flush();
      assert.ok(lines.some((l) => l.includes('Riprova pn-data-vault con FALLBACK-UUID')));
    });

    it('decisionTraceIdSwap shows both raw and canonical when they differ', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).decisionTraceIdSwap(
        'pn-user-attributes',
        '3d472be72977635208a92722b97b5e24',
        '1-3d472be7-2977635208a92722b97b5e24',
      );
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Originale: 3d472be72977635208a92722b97b5e24/);
      assert.match(joined, /Nuovo trace: 1-3d472be7-2977635208a92722b97b5e24/);
    });

    it('decisionTraceIdSwap collapses to a single line when raw === canonical', () => {
      const { narrative, lines } = captureLogger();
      const canonical = '1-3d472be7-2977635208a92722b97b5e24';
      new ApiGwReporter(narrative).decisionTraceIdSwap('pn-user-attributes', canonical, canonical);
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Nuovo trace \(già canonical\)/);
      assert.doesNotMatch(joined, /Originale:/);
    });

    it('decisionNoMatch and decisionLoopDetected render their respective banners', () => {
      const { narrative, lines } = captureLogger();
      const reporter = new ApiGwReporter(narrative);
      reporter.decisionNoMatch();
      reporter.decisionLoopDetected('pn-foo');
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Nessun KnownUrl in questo servizio/);
      assert.match(joined, /Loop rilevato \(pn-foo già visitato/);
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

  describe('stopSummary', () => {
    it('renders the chain of visited services', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).stopSummary({
        reason: 'no-match',
        matchedCaseIds: [],
        servicesVisited: [
          { name: 'pn-user-attributes', logCount: 42 },
          { name: 'pn-external-registries', logCount: 87 },
        ],
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /═══ Esecuzione terminata ═══/);
      assert.match(joined, /Servizi analizzati: 2 — pn-user-attributes \(42 log\) → pn-external-registries \(87 log\)/);
      assert.match(joined, /Esito: caso non riconosciuto/);
    });

    it('lists every matched case (sorted as received) and tags the primary', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).stopSummary({
        reason: 'known-case',
        matchedCaseIds: ['pdv-404', 'ext-registry-private-readtimeout', 'ext-registry-private-500-generic'],
        servicesVisited: [{ name: 'pn-user-attributes', logCount: 42 }],
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Casi noti rilevati: 3/);
      assert.match(joined, /pdv-404 ← primario/);
      assert.match(joined, /ext-registry-private-readtimeout/);
      assert.match(joined, /ext-registry-private-500-generic/);
    });

    it('renders single-case known-case outcome on one line', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).stopSummary({
        reason: 'known-case',
        matchedCaseIds: ['gateway-timeout-504'],
        servicesVisited: [{ name: 'pn-user-attributes', logCount: 0 }],
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Esito: caso noto \(gateway-timeout-504\)/);
      assert.doesNotMatch(joined, /Casi noti rilevati/);
    });

    it('renders external-downstream with the target and error message', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).stopSummary({
        reason: 'external-downstream',
        matchedCaseIds: [],
        downstreamTarget: 'AppIO',
        errorMessage: 'Service IO returned errors=500',
        servicesVisited: [{ name: 'pn-external-registries', logCount: 87 }],
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Esito: URL downstream \(AppIO\)/);
      assert.match(joined, /Errore: Service IO returned errors=500/);
    });

    it('renders api-gw execution-log unresolved outcome', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).stopSummary({
        reason: 'api-gw-execution-log-unresolved',
        matchedCaseIds: [],
        errorMessage: "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.",
        servicesVisited: [],
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /caso non riconosciuto negli execution log API Gateway/);
      assert.match(joined, /non e' stato possibile determinare il problema/);
    });

    it('renders loop-detected terminal banner', () => {
      const { narrative, lines } = captureLogger();
      new ApiGwReporter(narrative).stopSummary({
        reason: 'loop-detected',
        matchedCaseIds: [],
        servicesVisited: [{ name: 'pn-foo', logCount: 12 }],
      });
      narrative.flush();
      const joined = lines.join('\n');
      assert.match(joined, /Esito: loop rilevato/);
    });
  });
});

describe('renderApiGwFinalSummary', () => {
  it('builds the banner from final-context vars when no case matched', () => {
    const { logger, narrative, lines } = captureLogger();
    renderApiGwFinalSummary({
      logger,
      matchedCaseIds: [],
      vars: new Map<string, string>([
        ['apiGwServicesVisited', 'pn-user-attributes|42,pn-external-registries|87'],
        ['terminationReason', 'no-match'],
        ['lastErrorMsg', 'some upstream error'],
      ]),
    });
    narrative.flush();
    const joined = lines.join('\n');
    assert.match(joined, /Esito: caso non riconosciuto/);
    assert.match(joined, /Errore più rappresentativo: some upstream error/);
    assert.match(joined, /pn-user-attributes \(42 log\) → pn-external-registries \(87 log\)/);
  });

  it('matchedCaseIds wins over the local decide-step terminationReason', () => {
    const { logger, narrative, lines } = captureLogger();
    renderApiGwFinalSummary({
      logger,
      matchedCaseIds: ['gateway-timeout-504'],
      vars: new Map<string, string>([
        // The decide step had already written `no-match` before the
        // engine matched a case via early resolution.
        ['terminationReason', 'no-match'],
        ['apiGwServicesVisited', 'pn-user-attributes|0'],
      ]),
    });
    narrative.flush();
    const joined = lines.join('\n');
    assert.match(joined, /Esito: caso noto \(gateway-timeout-504\)/);
    assert.doesNotMatch(joined, /caso non riconosciuto/);
  });

  it('falls back to apiGwErrorMessage + endpoint when lastErrorMsg is missing', () => {
    const { logger, narrative, lines } = captureLogger();
    renderApiGwFinalSummary({
      logger,
      matchedCaseIds: [],
      vars: new Map<string, string>([
        ['apiGwErrorMessage', 'Endpoint request timed out'],
        ['apiGwHttpMethod', 'GET'],
        ['apiGwPath', '/address-book-io/v1/digital-address/courtesy'],
        ['apiGwServicesVisited', 'pn-user-attributes|0'],
      ]),
    });
    narrative.flush();
    const joined = lines.join('\n');
    assert.match(joined, /Endpoint request timed out \[GET \/address-book-io\/v1\/digital-address\/courtesy\]/);
  });

  it('ignores the literal `-` placeholder when falling back to API GW evidence', () => {
    const { logger, narrative, lines } = captureLogger();
    renderApiGwFinalSummary({
      logger,
      matchedCaseIds: [],
      vars: new Map<string, string>([
        ['apiGwErrorMessage', '-'],
        ['apiGwPath', '-'],
        ['apiGwHttpMethod', '-'],
        ['apiGwServicesVisited', 'pn-user-attributes|0'],
      ]),
    });
    narrative.flush();
    const joined = lines.join('\n');
    assert.match(joined, /Nessun error message disponibile/);
  });
});
