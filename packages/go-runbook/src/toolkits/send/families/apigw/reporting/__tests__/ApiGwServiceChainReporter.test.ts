import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogger } from '@pagopa/go-common/logging';
import { ConsoleRunbookReporter } from '../../../../../../engine/reporting/ConsoleRunbookReporter.js';
import { ApiGwServiceChainReporter } from '../ApiGwServiceChainReporter.js';

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
