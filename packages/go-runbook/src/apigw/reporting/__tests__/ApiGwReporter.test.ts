import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogger } from '@go-automation/go-common/core';
import { ApiGwReporter, renderApiGwFinalSummary } from '../ApiGwReporter.js';

/**
 * Minimal `GOLogger` stand-in that captures `text()` and `newline()`
 * emissions so tests can inspect the rendered banner content without
 * a real logger pipeline.
 */
function captureLogger(): { logger: GOLogger; lines: string[] } {
  const lines: string[] = [];
  const logger = {
    text: (msg: string) => lines.push(msg),
    newline: () => lines.push(''),
  } as unknown as GOLogger;
  return { logger, lines };
}

describe('ApiGwReporter', () => {
  describe('sectionPrepare', () => {
    it('renders the preparation banner with the log group', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).sectionPrepare('/aws/apigw/main');
      assert.ok(lines.some((l) => l === '═══ Preparazione: query API Gateway ═══'));
      assert.ok(lines.some((l) => l.includes('Log group: /aws/apigw/main')));
    });
  });

  describe('apiGwResult', () => {
    it('renders error count, endpoint, error message and trace id when all are present', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).apiGwResult({
        errorCount: 3,
        statusCode: '500',
        xRayTraceId: '1-abc-def',
        errorMessage: 'Endpoint request timed out',
        path: '/v1/foo',
        httpMethod: 'POST',
      });
      const joined = lines.join('\n');
      assert.match(joined, /Errori HTTP individuati: 3 \(status 500\)/);
      assert.match(joined, /Endpoint: POST \/v1\/foo/);
      assert.match(joined, /Error message API GW: Endpoint request timed out/);
      assert.match(joined, /XRay Trace Id: 1-abc-def/);
    });

    it('skips endpoint/error-message rows when only the API GW `-` placeholder is present', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).apiGwResult({
        errorCount: 1,
        statusCode: '504',
        xRayTraceId: undefined,
        errorMessage: '-',
        path: '-',
        httpMethod: '-',
      });
      const joined = lines.join('\n');
      assert.doesNotMatch(joined, /Endpoint:/);
      assert.doesNotMatch(joined, /Error message API GW:/);
      assert.match(joined, /XRay Trace Id: non disponibile/);
    });
  });

  describe('sectionService', () => {
    it('marks the entry service and includes the log group', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).sectionService(1, 'pn-user-attributes', true, ['/aws/ecs/pn-user-attributes']);
      const joined = lines.join('\n');
      assert.match(joined, /═══ Servizio 1: pn-user-attributes \(entry\) ═══/);
      assert.match(joined, /Log group: \/aws\/ecs\/pn-user-attributes/);
    });

    it('omits the entry tag for downstream services', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).sectionService(2, 'pn-external-registries', false, ['/aws/ecs/pn-external-registries']);
      const joined = lines.join('\n');
      assert.match(joined, /═══ Servizio 2: pn-external-registries ═══/);
      assert.doesNotMatch(joined, /\(entry\)/);
    });
  });

  describe('query / queryResult', () => {
    it('renders identifiers joined by OR when multiple are present', () => {
      const { logger, lines } = captureLogger();
      const reporter = new ApiGwReporter(logger);
      reporter.query(3, ['xRayTraceId=1-abc', 'fallbackUuid=fb-1']);
      reporter.queryResult(42);
      const joined = lines.join('\n');
      assert.match(joined, /Query CloudWatch 3 \[filter: xRayTraceId=1-abc OR fallbackUuid=fb-1\]/);
      assert.match(joined, /42 log trovati/);
    });

    it('falls back to a textual placeholder when no identifiers are passed', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).query(1, []);
      assert.ok(lines.some((l) => l.includes('nessun identificatore')));
    });
  });

  describe('queryFailed', () => {
    it('renders a "Query fallita" banner with the log group and the cause', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).queryFailed(
        ['/aws/ecs/pn-data-vault-sep'],
        "Log group '/aws/ecs/pn-data-vault-sep' does not exist for account ID '510769970275'",
      );
      const joined = lines.join('\n');
      assert.match(joined, /⚠ Query fallita/);
      assert.match(joined, /Log group: \/aws\/ecs\/pn-data-vault-sep/);
      assert.match(joined, /Causa: Log group '\/aws\/ecs\/pn-data-vault-sep' does not exist/);
    });

    it('uses the plural form when multiple log groups are passed', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).queryFailed(['/a', '/b'], 'AccessDenied');
      const joined = lines.join('\n');
      assert.match(joined, /Log groups: \/a, \/b/);
      assert.match(joined, /Causa: AccessDenied/);
    });
  });

  describe('analysisFindings', () => {
    it('reports an error message, known URL and fresh fallback UUID when all surfaced', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).analysisFindings({
        errorMessageLen: 412,
        knownUrl: { observedUrl: 'http://internal/...', target: 'pn-external-registries' },
        fallbackUuid: '8f41cb6b-4a21-4c11-89f1-ee688423b7aa',
      });
      const joined = lines.join('\n');
      assert.match(joined, /Error message individuato \(len=412\)/);
      assert.match(joined, /KnownUrl rilevato → target: pn-external-registries/);
      assert.match(joined, /URL: http:\/\/internal\/\.\.\./);
      assert.match(joined, /FALLBACK-UUID estratto: 8f41cb6b-4a21-4c11-89f1-ee688423b7aa/);
    });

    it('renders "nessun error message" and "nessun FALLBACK-UUID nuovo" on empty findings', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).analysisFindings({ errorMessageLen: 0 });
      const joined = lines.join('\n');
      assert.match(joined, /Nessun error message rilevato/);
      assert.match(joined, /Nessun FALLBACK-UUID nuovo/);
    });
  });

  describe('decision methods', () => {
    it('decisionKnownCase prints the case id', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).decisionKnownCase('appio-cosmos-429');
      assert.ok(lines.some((l) => l.includes('Match caso noto: appio-cosmos-429')));
    });

    it('decisionGoToService prints the target', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).decisionGoToService('pn-external-registries');
      assert.ok(lines.some((l) => l.includes('Prosegue con il servizio: pn-external-registries')));
    });

    it('decisionExternalDownstream prints the downstream target', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).decisionExternalDownstream('AppIO');
      assert.ok(lines.some((l) => l.includes('URL downstream individuato (AppIO)')));
    });

    it('decisionFallbackRetry prints the service to be re-queried', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).decisionFallbackRetry('pn-data-vault');
      assert.ok(lines.some((l) => l.includes('Riprova pn-data-vault con FALLBACK-UUID')));
    });

    it('decisionTraceIdSwap shows both raw and canonical when they differ', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).decisionTraceIdSwap(
        'pn-user-attributes',
        '3d472be72977635208a92722b97b5e24',
        '1-3d472be7-2977635208a92722b97b5e24',
      );
      const joined = lines.join('\n');
      assert.match(joined, /Originale: 3d472be72977635208a92722b97b5e24/);
      assert.match(joined, /Nuovo trace: 1-3d472be7-2977635208a92722b97b5e24/);
    });

    it('decisionTraceIdSwap collapses to a single line when raw === canonical', () => {
      const { logger, lines } = captureLogger();
      const canonical = '1-3d472be7-2977635208a92722b97b5e24';
      new ApiGwReporter(logger).decisionTraceIdSwap('pn-user-attributes', canonical, canonical);
      const joined = lines.join('\n');
      assert.match(joined, /Nuovo trace \(già canonical\)/);
      assert.doesNotMatch(joined, /Originale:/);
    });

    it('decisionNoMatch and decisionLoopDetected render their respective banners', () => {
      const { logger, lines } = captureLogger();
      const reporter = new ApiGwReporter(logger);
      reporter.decisionNoMatch();
      reporter.decisionLoopDetected('pn-foo');
      const joined = lines.join('\n');
      assert.match(joined, /Nessun KnownUrl in questo servizio/);
      assert.match(joined, /Loop rilevato \(pn-foo già visitato/);
    });
  });

  describe('apiGwExecutionLog', () => {
    it('renders execution-log requestIds and result count', () => {
      const { logger, lines } = captureLogger();
      const reporter = new ApiGwReporter(logger);
      reporter.apiGwExecutionLogQuery('API-Gateway-Execution-Logs_test/prod', [
        { path: '/resource-a', requestId: 'req-a' },
        { path: '/resource-b', requestId: 'req-b' },
      ]);
      reporter.apiGwExecutionLogResult(12);
      const joined = lines.join('\n');
      assert.match(joined, /query execution log/);
      assert.match(joined, /API-Gateway-Execution-Logs_test\/prod/);
      assert.match(joined, /\/resource-a: req-a/);
      assert.match(joined, /Execution log trovati: 12/);
    });
  });

  describe('stopSummary', () => {
    it('renders the chain of visited services', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).stopSummary({
        reason: 'no-match',
        matchedCaseIds: [],
        servicesVisited: [
          { name: 'pn-user-attributes', logCount: 42 },
          { name: 'pn-external-registries', logCount: 87 },
        ],
      });
      const joined = lines.join('\n');
      assert.match(joined, /═══ Esecuzione terminata ═══/);
      assert.match(joined, /Servizi analizzati: 2 — pn-user-attributes \(42 log\) → pn-external-registries \(87 log\)/);
      assert.match(joined, /Esito: caso non riconosciuto/);
    });

    it('lists every matched case (sorted as received) and tags the primary', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).stopSummary({
        reason: 'known-case',
        matchedCaseIds: ['pdv-404', 'ext-registry-private-readtimeout', 'ext-registry-private-500-generic'],
        servicesVisited: [{ name: 'pn-user-attributes', logCount: 42 }],
      });
      const joined = lines.join('\n');
      assert.match(joined, /Casi noti rilevati: 3/);
      assert.match(joined, /pdv-404 ← primario/);
      assert.match(joined, /ext-registry-private-readtimeout/);
      assert.match(joined, /ext-registry-private-500-generic/);
    });

    it('renders single-case known-case outcome on one line', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).stopSummary({
        reason: 'known-case',
        matchedCaseIds: ['gateway-timeout-504'],
        servicesVisited: [{ name: 'pn-user-attributes', logCount: 0 }],
      });
      const joined = lines.join('\n');
      assert.match(joined, /Esito: caso noto \(gateway-timeout-504\)/);
      assert.doesNotMatch(joined, /Casi noti rilevati/);
    });

    it('renders external-downstream with the target and error message', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).stopSummary({
        reason: 'external-downstream',
        matchedCaseIds: [],
        downstreamTarget: 'AppIO',
        errorMessage: 'Service IO returned errors=500',
        servicesVisited: [{ name: 'pn-external-registries', logCount: 87 }],
      });
      const joined = lines.join('\n');
      assert.match(joined, /Esito: URL downstream \(AppIO\)/);
      assert.match(joined, /Errore: Service IO returned errors=500/);
    });

    it('renders api-gw execution-log unresolved outcome', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).stopSummary({
        reason: 'api-gw-execution-log-unresolved',
        matchedCaseIds: [],
        errorMessage: "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.",
        servicesVisited: [],
      });
      const joined = lines.join('\n');
      assert.match(joined, /caso non riconosciuto negli execution log API Gateway/);
      assert.match(joined, /non e' stato possibile determinare il problema/);
    });

    it('renders loop-detected terminal banner', () => {
      const { logger, lines } = captureLogger();
      new ApiGwReporter(logger).stopSummary({
        reason: 'loop-detected',
        matchedCaseIds: [],
        servicesVisited: [{ name: 'pn-foo', logCount: 12 }],
      });
      const joined = lines.join('\n');
      assert.match(joined, /Esito: loop rilevato/);
    });
  });
});

describe('renderApiGwFinalSummary', () => {
  it('builds the banner from final-context vars when no case matched', () => {
    const { logger, lines } = captureLogger();
    renderApiGwFinalSummary({
      logger,
      matchedCaseIds: [],
      vars: new Map<string, string>([
        ['apiGwServicesVisited', 'pn-user-attributes|42,pn-external-registries|87'],
        ['terminationReason', 'no-match'],
        ['lastErrorMsg', 'some upstream error'],
      ]),
    });
    const joined = lines.join('\n');
    assert.match(joined, /Esito: caso non riconosciuto/);
    assert.match(joined, /Errore più rappresentativo: some upstream error/);
    assert.match(joined, /pn-user-attributes \(42 log\) → pn-external-registries \(87 log\)/);
  });

  it('matchedCaseIds wins over the local decide-step terminationReason', () => {
    const { logger, lines } = captureLogger();
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
    const joined = lines.join('\n');
    assert.match(joined, /Esito: caso noto \(gateway-timeout-504\)/);
    assert.doesNotMatch(joined, /caso non riconosciuto/);
  });

  it('falls back to apiGwErrorMessage + endpoint when lastErrorMsg is missing', () => {
    const { logger, lines } = captureLogger();
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
    const joined = lines.join('\n');
    assert.match(joined, /Endpoint request timed out \[GET \/address-book-io\/v1\/digital-address\/courtesy\]/);
  });

  it('ignores the literal `-` placeholder when falling back to API GW evidence', () => {
    const { logger, lines } = captureLogger();
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
    const joined = lines.join('\n');
    assert.match(joined, /Nessun error message disponibile/);
  });
});
