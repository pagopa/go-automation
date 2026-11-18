import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogger } from '@pagopa/go-common/logging';
import { ConsoleRunbookReporter } from '../../../../../../engine/reporting/ConsoleRunbookReporter.js';
import { ApiGwServiceChainReporter } from '../ApiGwServiceChainReporter.js';
import { renderApiGwFinalSummary } from '../renderApiGwFinalSummary.js';
import type { ApiGwFinalSummaryInput } from '../ApiGwFinalSummaryInput.js';

/** Lines a logger stand-in captured, and the logger itself. */
function captureLogger(): { readonly logger: GOLogger; readonly lines: string[] } {
  const lines: string[] = [];
  const logger = { text: (msg: string) => lines.push(msg), newline: () => lines.push('') } as unknown as GOLogger;
  return { logger, lines };
}

/** Reports something through the reporter under test. */
type ReportFn = (reporter: ApiGwServiceChainReporter) => void;

/** What a reporter interaction renders once flushed. */
function render(report: ReportFn): string {
  const { logger, lines } = captureLogger();
  const narrative = new ConsoleRunbookReporter(logger);
  report(new ApiGwServiceChainReporter(narrative));
  narrative.flush();
  return lines.join('\n');
}

/** A rendering case: what is reported, the patterns it must show and those it must not. */
type RenderCase = readonly [string, ReportFn, ReadonlyArray<RegExp>, ReadonlyArray<RegExp>?];

const CANONICAL = '1-3d472be7-2977635208a92722b97b5e24';

const CASES: ReadonlyArray<RenderCase> = [
  [
    'the entry service section with its log group',
    (r) => r.sectionService(1, 'pn-user-attributes', true, ['/aws/ecs/pn-user-attributes']),
    [/═══ Servizio 1: pn-user-attributes \(entry\) ═══/, /Log group: \/aws\/ecs\/pn-user-attributes/],
  ],
  [
    'a downstream service section without the entry tag',
    (r) => r.sectionService(2, 'pn-external-registries', false, ['/aws/ecs/pn-external-registries']),
    [/═══ Servizio 2: pn-external-registries ═══/],
    [/\(entry\)/],
  ],
  [
    'the identifiers of a query joined by OR, and its result',
    (r) => {
      r.query(3, ['xRayTraceId=1-abc', 'fallbackUuid=fb-1']);
      r.queryResult(42);
    },
    [/Query CloudWatch 3 \[filter: xRayTraceId=1-abc OR fallbackUuid=fb-1\]/, /42 log trovati/],
  ],
  ['a placeholder for a query without identifiers', (r) => r.query(1, []), [/nessun identificatore/]],
  [
    'every analysis finding',
    (r) =>
      r.analysisFindings({
        errorMessageLen: 412,
        knownUrl: { observedUrl: 'http://internal/...', target: 'pn-external-registries' },
        fallbackUuid: '8f41cb6b-4a21-4c11-89f1-ee688423b7aa',
      }),
    [
      /Error message individuato \(len=412\)/,
      /KnownUrl rilevato → target: pn-external-registries/,
      /URL: http:\/\/internal\/\.\.\./,
      /FALLBACK-UUID estratto: 8f41cb6b-4a21-4c11-89f1-ee688423b7aa/,
    ],
  ],
  [
    'empty analysis findings',
    (r) => r.analysisFindings({ errorMessageLen: 0 }),
    [/Nessun error message rilevato/, /Nessun FALLBACK-UUID nuovo/],
  ],
  [
    'every decision',
    (r) => {
      r.decisionKnownCase('appio-cosmos-429');
      r.decisionGoToService('pn-external-registries');
      r.decisionExternalDownstream('AppIO');
      r.decisionFallbackRetry('pn-data-vault');
      r.decisionNoMatch();
      r.decisionLoopDetected('pn-foo');
    },
    [
      /Match caso noto: appio-cosmos-429/,
      /Prosegue con il servizio: pn-external-registries/,
      /URL downstream individuato \(AppIO\)/,
      /Riprova pn-data-vault con FALLBACK-UUID/,
      /Nessun KnownUrl in questo servizio/,
      /Loop rilevato \(pn-foo già visitato/,
    ],
  ],
  [
    'a trace id swap with both forms when they differ',
    (r) => r.decisionTraceIdSwap('pn-user-attributes', '3d472be72977635208a92722b97b5e24', CANONICAL),
    [/Originale: 3d472be72977635208a92722b97b5e24/, new RegExp(`Nuovo trace: ${CANONICAL}`)],
  ],
  [
    'a trace id swap on one line when the raw form is canonical',
    (r) => r.decisionTraceIdSwap('pn-user-attributes', CANONICAL, CANONICAL),
    [/Nuovo trace \(già canonical\)/],
    [/Originale:/],
  ],
  [
    'the chain of visited services',
    (r) =>
      r.stopSummary({
        reason: 'no-match',
        matchedCaseIds: [],
        servicesVisited: [
          { name: 'pn-user-attributes', logCount: 42 },
          { name: 'pn-external-registries', logCount: 87 },
        ],
      }),
    [
      /═══ Esecuzione terminata ═══/,
      /Servizi analizzati: 2 — pn-user-attributes \(42 log\) → pn-external-registries \(87 log\)/,
      /Esito: caso non riconosciuto/,
    ],
  ],
  [
    'every matched case, as received, with the primary tagged',
    (r) =>
      r.stopSummary({
        reason: 'known-case',
        matchedCaseIds: ['pdv-404', 'ext-registry-private-readtimeout', 'ext-registry-private-500-generic'],
        servicesVisited: [{ name: 'pn-user-attributes', logCount: 42 }],
      }),
    [
      /Casi noti rilevati: 3/,
      /pdv-404 ← primario/,
      /ext-registry-private-readtimeout/,
      /ext-registry-private-500-generic/,
    ],
  ],
  [
    'a single matched case on one line',
    (r) =>
      r.stopSummary({
        reason: 'known-case',
        matchedCaseIds: ['gateway-timeout-504'],
        servicesVisited: [{ name: 'pn-user-attributes', logCount: 0 }],
      }),
    [/Esito: caso noto \(gateway-timeout-504\)/],
    [/Casi noti rilevati/],
  ],
  [
    'an external downstream with its error',
    (r) =>
      r.stopSummary({
        reason: 'external-downstream',
        matchedCaseIds: [],
        downstreamTarget: 'AppIO',
        errorMessage: 'Service IO returned errors=500',
        servicesVisited: [{ name: 'pn-external-registries', logCount: 87 }],
      }),
    [/Esito: URL downstream \(AppIO\)/, /Errore: Service IO returned errors=500/],
  ],
  [
    'an unresolved execution-log outcome',
    (r) =>
      r.stopSummary({
        reason: 'api-gw-execution-log-unresolved',
        matchedCaseIds: [],
        errorMessage: "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.",
        servicesVisited: [],
      }),
    [/caso non riconosciuto negli execution log API Gateway/, /non e' stato possibile determinare il problema/],
  ],
  [
    'a detected loop',
    (r) =>
      r.stopSummary({
        reason: 'loop-detected',
        matchedCaseIds: [],
        servicesVisited: [{ name: 'pn-foo', logCount: 12 }],
      }),
    [/Esito: loop rilevato/],
  ],
];

describe('ApiGwServiceChainReporter', () => {
  for (const [name, report, shown, hidden = []] of CASES) {
    it(`renders ${name}`, () => {
      const rendered = render(report);
      for (const pattern of shown) assert.match(rendered, pattern);
      for (const pattern of hidden) assert.doesNotMatch(rendered, pattern);
    });
  }
});

describe('renderApiGwFinalSummary', () => {
  function summary(input: Omit<ApiGwFinalSummaryInput, 'logger'>): string {
    const { logger, lines } = captureLogger();
    renderApiGwFinalSummary({ logger, ...input });
    return lines.join('\n');
  }

  const cases: ReadonlyArray<
    readonly [string, Omit<ApiGwFinalSummaryInput, 'logger'>, ReadonlyArray<RegExp>, ReadonlyArray<RegExp>?]
  > = [
    [
      'builds the banner from the final vars when no case matched',
      {
        status: 'completed',
        matchedCaseIds: [],
        vars: new Map([
          ['apiGwServicesVisited', 'pn-user-attributes|42,pn-external-registries|87'],
          ['terminationReason', 'no-match'],
          ['lastErrorMsg', 'some upstream error'],
        ]),
      },
      [
        /Esito: caso non riconosciuto/,
        /Errore più rappresentativo: some upstream error/,
        /pn-user-attributes \(42 log\) → pn-external-registries \(87 log\)/,
      ],
    ],
    [
      // The decide step had already written `no-match` before the engine matched a case via early resolution.
      'lets matchedCaseIds win over the local terminationReason',
      {
        status: 'completed',
        matchedCaseIds: ['gateway-timeout-504'],
        vars: new Map([['terminationReason', 'no-match']]),
      },
      [/Esito: caso noto \(gateway-timeout-504\)/],
      [/caso non riconosciuto/],
    ],
    [
      'falls back to the API Gateway error and endpoint without lastErrorMsg',
      {
        status: 'completed',
        matchedCaseIds: [],
        vars: new Map([
          ['apiGwErrorMessage', 'Endpoint request timed out'],
          ['apiGwHttpMethod', 'GET'],
          ['apiGwPath', '/address-book-io/v1/digital-address/courtesy'],
        ]),
      },
      [/Endpoint request timed out \[GET \/address-book-io\/v1\/digital-address\/courtesy\]/],
    ],
    [
      'ignores the `-` placeholder of the API Gateway evidence',
      {
        status: 'completed',
        matchedCaseIds: [],
        vars: new Map([
          ['apiGwErrorMessage', '-'],
          ['apiGwPath', '-'],
          ['apiGwHttpMethod', '-'],
        ]),
      },
      [/Nessun error message disponibile/],
    ],
    [
      'says the run failed, without reading a termination reason the pipeline never wrote',
      {
        status: 'failed',
        failureReason: 'MalformedQueryException su query-api-gw-logs',
        matchedCaseIds: [],
        vars: new Map([['terminationReason', 'no-match']]),
      },
      [/Esito: esecuzione fallita/u, /MalformedQueryException/u],
      [/caso non riconosciuto/u],
    ],
    [
      'reports an aborted run as interrupted, not as an outcome',
      { status: 'aborted', matchedCaseIds: [], vars: new Map() },
      [/Esito: esecuzione interrotta/u],
    ],
  ];

  for (const [name, input, shown, hidden = []] of cases) {
    it(name, () => {
      const rendered = summary(input);
      for (const pattern of shown) assert.match(rendered, pattern);
      for (const pattern of hidden) assert.doesNotMatch(rendered, pattern);
    });
  }
});
