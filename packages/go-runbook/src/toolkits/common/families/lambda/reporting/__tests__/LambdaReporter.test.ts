import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LambdaReporter } from '../LambdaReporter.js';
import { captureNarrative } from '../../../../../../__tests__/helpers/captureNarrative.js';

describe('LambdaReporter', () => {
  it('renders the preparation banner with lambda, event source and log group', () => {
    const { lines, reporter: logger } = captureNarrative();
    new LambdaReporter(logger).sectionPrepare('pn-x', '/aws/lambda/pn-x', 'sqs');
    logger.flush();
    const out = lines.join('\n');
    assert.match(out, /Preparazione: query Lambda/);
    assert.match(out, /Lambda: pn-x/);
    assert.match(out, /eventSource: sqs/);
    assert.match(out, /Log group: \/aws\/lambda\/pn-x/);
  });

  it('renders the result with error count, category and requestId', () => {
    const { lines, reporter: logger } = captureNarrative();
    new LambdaReporter(logger).lambdaResult({
      errorCount: 1,
      category: 'timeout',
      requestId: 'd848f0c5-1089-5c2b-9a3b-91a94511ee52',
      runtimeStatus: 'timeout',
      durationMs: 10000,
    });
    logger.flush();
    const out = lines.join('\n');
    assert.match(out, /Errori individuati: 1/);
    assert.match(out, /Categoria: timeout/);
    assert.match(out, /requestId: d848f0c5-1089-5c2b-9a3b-91a94511ee52/);
  });

  it('renders the invocation section and the lines of a downstream read', () => {
    const { lines, reporter: logger } = captureNarrative();
    const reporter = new LambdaReporter(logger);
    reporter.invocation('req-1', 3);
    reporter.downstream('/aws/ecs/pn-emd-integration', 2);
    logger.flush();
    const out = lines.join('\n');
    assert.match(out, /Flusso invocazione/);
    assert.match(out, /filter: req-1/);
    assert.match(out, /Log group: \/aws\/ecs\/pn-emd-integration/);
    assert.match(out, /Log trovati: 2/);
  });

  it('closes a flat level with the elbow', () => {
    const { lines, reporter: logger } = captureNarrative();
    new LambdaReporter(logger).invocation('req-1', 3);

    logger.flush();
    assert.deepStrictEqual(lines, [
      '',
      '\u2550\u2550\u2550 Flusso invocazione (per requestId) \u2550\u2550\u2550',
      '  \u251c\u2500 Query CloudWatch [filter: req-1]',
      '  \u2514\u2500 Log trovati: 3',
    ]);
  });

  it('hangs the query failure details under the failure node', () => {
    const { lines, reporter: logger } = captureNarrative();
    new LambdaReporter(logger).queryFailed(['/a', '/b'], 'AccessDenied');

    logger.flush();
    assert.deepStrictEqual(lines, [
      '  \u2514\u2500 \u26a0 Query fallita',
      '     \u251c\u2500 Log groups: /a, /b',
      '     \u2514\u2500 Causa: AccessDenied',
    ]);
  });
});
