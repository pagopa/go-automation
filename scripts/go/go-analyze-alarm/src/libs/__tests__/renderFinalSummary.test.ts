import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogger } from '@pagopa/go-common/logging';
import type { Runbook, RunbookExecutionResult } from '@pagopa/go-runbook';

import { renderFinalSummary } from '../renderFinalSummary.js';

/** A logger that records every call as `method: text`. */
function recordingLogger(): { readonly logger: GOLogger; readonly lines: string[] } {
  const lines: string[] = [];
  // Safe: renderers only call logging methods, each recorded with its first argument.
  const logger = new Proxy(
    {},
    {
      get:
        (_target, method) =>
        (...args: unknown[]): void => {
          const [text] = args;
          lines.push(`${String(method)}: ${typeof text === 'string' ? text : JSON.stringify(text)}`);
        },
    },
  ) as GOLogger;
  return { logger, lines };
}

// Safe: the renderers read only status, matched cases, vars and the failure reason.
const RESULT = {
  status: 'completed',
  matchedCases: [],
  finalContext: { vars: new Map<string, string>() },
  trace: { execution: {} },
} as unknown as RunbookExecutionResult;

function runbookWith(runbookContext: unknown): Runbook {
  // Safe: only runbookContext is read.
  return { runbookContext } as unknown as Runbook;
}

const API_GW = {
  kind: 'apigw',
  apiGwLogGroup: 'API-Gateway-Execution-Logs',
  queryProfileId: 'p',
  services: [{ name: 'interop-be-api', varPrefix: 'api', logGroup: '/aws/eks/interop-be-api' }],
};

describe('renderFinalSummary (EVO-RBREORG-OPUS-01 P19)', () => {
  it('never renders the SEND service-chain summary for an INTEROP API Gateway runbook', () => {
    const interop = recordingLogger();
    renderFinalSummary(interop.logger, runbookWith({ ...API_GW, product: 'INTEROP' }), RESULT);
    const send = recordingLogger();
    renderFinalSummary(send.logger, runbookWith({ ...API_GW, product: 'SEND' }), RESULT);

    assert.deepStrictEqual(interop.lines, [
      'section: INTEROP API Gateway Runbook Summary',
      'info: API Gateway log group: API-Gateway-Execution-Logs',
      'info: Service: interop-be-api',
    ]);
    assert.notDeepStrictEqual(send.lines, interop.lines);
    assert.ok(!send.lines.includes('section: INTEROP API Gateway Runbook Summary'));
  });

  it('presents an INTEROP K8S runbook as such, not as a SEND service runbook', () => {
    const service = {
      kind: 'service',
      queryProfileId: 'p',
      service: { name: 'interop-be-x', logGroup: '/l', varPrefix: 'x' },
    };
    const k8s = recordingLogger();
    renderFinalSummary(k8s.logger, runbookWith({ ...service, product: 'INTEROP' }), RESULT);
    const send = recordingLogger();
    renderFinalSummary(send.logger, runbookWith({ ...service, product: 'SEND' }), RESULT);

    assert.deepStrictEqual(k8s.lines, ['section: INTEROP K8S Runbook Summary', 'info: Service: interop-be-x']);
    assert.deepStrictEqual(send.lines, ['section: Service Runbook Summary', 'info: Service: interop-be-x']);
  });
});
