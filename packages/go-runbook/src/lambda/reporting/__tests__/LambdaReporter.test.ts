import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GOLogger } from '@go-automation/go-common/core';

import { LambdaReporter } from '../LambdaReporter.js';

/** Minimal GOLogger capturing the text/newline output the reporter emits. */
function captureLogger(): { readonly lines: string[]; readonly logger: GOLogger } {
  const lines: string[] = [];
  const logger = {
    text: (line: string): void => {
      lines.push(line);
    },
    newline: (): void => {
      lines.push('');
    },
  } as unknown as GOLogger;
  return { lines, logger };
}

describe('LambdaReporter', () => {
  it('renders the preparation banner with lambda, event source and log group', () => {
    const { lines, logger } = captureLogger();
    new LambdaReporter(logger).sectionPrepare('pn-x', '/aws/lambda/pn-x', 'sqs');
    const out = lines.join('\n');
    assert.match(out, /Preparazione: query Lambda/);
    assert.match(out, /Lambda: pn-x/);
    assert.match(out, /eventSource: sqs/);
    assert.match(out, /Log group: \/aws\/lambda\/pn-x/);
  });

  it('renders the result with error count, category and requestId', () => {
    const { lines, logger } = captureLogger();
    new LambdaReporter(logger).lambdaResult({
      errorCount: 1,
      category: 'timeout',
      requestId: 'd848f0c5-1089-5c2b-9a3b-91a94511ee52',
      runtimeStatus: 'timeout',
      durationMs: 10000,
    });
    const out = lines.join('\n');
    assert.match(out, /Errori individuati: 1/);
    assert.match(out, /Categoria: timeout/);
    assert.match(out, /requestId: d848f0c5-1089-5c2b-9a3b-91a94511ee52/);
  });

  it('renders the invocation and downstream sections', () => {
    const { lines, logger } = captureLogger();
    const reporter = new LambdaReporter(logger);
    reporter.invocation('req-1', 3);
    reporter.downstream('pn-emd-integration', '/aws/ecs/pn-emd-integration', 2);
    const out = lines.join('\n');
    assert.match(out, /Flusso invocazione/);
    assert.match(out, /filter: req-1/);
    assert.match(out, /Downstream: pn-emd-integration/);
  });

  it('renders the closing summary for a known case', () => {
    const { lines, logger } = captureLogger();
    new LambdaReporter(logger).stopSummary({ reason: 'known-case', matchedCaseIds: ['lambda-timeout'] });
    const out = lines.join('\n');
    assert.match(out, /Esecuzione terminata/);
    assert.match(out, /caso noto \(lambda-timeout\)/);
  });

  it('renders the no-errors outcome', () => {
    const { lines, logger } = captureLogger();
    new LambdaReporter(logger).stopSummary({ reason: 'no-errors', matchedCaseIds: [] });
    assert.match(lines.join('\n'), /nessun errore individuato/);
  });
});
