import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOScript } from '../GOScript.js';

describe('GOScript.createLambdaHandler body envelope', () => {
  // GOScript wires the Lambda event config provider only in AWS-managed
  // environments; simulate one so the event payload is actually injected.
  let previousLambdaEnv: string | undefined;
  before(() => {
    previousLambdaEnv = process.env['AWS_LAMBDA_FUNCTION_NAME'];
    process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'go-test-fn';
  });
  after(() => {
    if (previousLambdaEnv === undefined) {
      delete process.env['AWS_LAMBDA_FUNCTION_NAME'];
    } else {
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = previousLambdaEnv;
    }
  });

  async function runWith(event: unknown): Promise<string | undefined> {
    const script = new GOScript({
      metadata: { name: 'body env test', version: '1.0.0', description: 'body env', authors: ['test'] },
      config: {
        parameters: [
          { name: 'probe.value', type: GOConfigParameterType.STRING, description: 'probe', required: false },
        ],
      },
      logging: { console: false, file: false },
    });

    let captured: string | undefined;
    const handler = script.createLambdaHandler(async () => {
      const cfg = await script.getConfiguration<{ probeValue?: string }>();
      captured = cfg.probeValue;
    });
    await handler(event).catch(() => undefined);
    return captured;
  }

  it('maps keys from a body envelope (object or JSON string), falling back to flat top-level keys', async () => {
    const cases: ReadonlyArray<readonly [string, unknown, string]> = [
      ['body object', { body: { 'probe.value': 'from-body' } }, 'from-body'],
      [
        'body JSON string (API Gateway style)',
        { body: JSON.stringify({ 'probe.value': 'from-string' }) },
        'from-string',
      ],
      ['flat keys without a body', { 'probe.value': 'flat' }, 'flat'],
      // Transport metadata at the top level is ignored when a body envelope is present.
      ['body next to transport metadata', { source: 'aws.events', body: { 'probe.value': 'enveloped' } }, 'enveloped'],
    ];

    for (const [name, event, expected] of cases) {
      assert.strictEqual(await runWith(event), expected, name);
    }
  });
});

interface ProbeLambdaContext {
  callbackWaitsForEmptyEventLoop: boolean;
}

type ProbeLambdaHandler = (event: unknown, context?: ProbeLambdaContext) => Promise<void>;

describe('GOScript.createLambdaHandler event-loop detach', () => {
  function noopHandler(): ProbeLambdaHandler {
    const script = new GOScript({
      metadata: { name: 'detach test', version: '1.0.0', description: 'detach', authors: ['test'] },
      config: { parameters: [] },
      logging: { console: false, file: false },
    });
    return script.createLambdaHandler<unknown, void, ProbeLambdaContext>(async () => {
      await Promise.resolve();
    });
  }

  it('sets callbackWaitsForEmptyEventLoop = false on the Lambda context', async () => {
    const context = { awsRequestId: 'req-1', callbackWaitsForEmptyEventLoop: true };

    // The flag is flipped synchronously before any await, so it holds regardless
    // of how the lifecycle resolves.
    await noopHandler()(undefined, context).catch(() => undefined);

    assert.strictEqual(context.callbackWaitsForEmptyEventLoop, false);
  });

  it('does not throw when invoked without a context (local / test invocation)', async () => {
    await assert.doesNotReject(noopHandler()(undefined));
  });
});
