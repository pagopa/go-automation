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

  it('maps keys from a body object envelope', async () => {
    assert.strictEqual(await runWith({ body: { 'probe.value': 'from-body' } }), 'from-body');
  });

  it('maps keys from a body JSON-string envelope (API Gateway style)', async () => {
    assert.strictEqual(await runWith({ body: JSON.stringify({ 'probe.value': 'from-string' }) }), 'from-string');
  });

  it('falls back to flat top-level keys when there is no body', async () => {
    assert.strictEqual(await runWith({ 'probe.value': 'flat' }), 'flat');
  });

  it('ignores transport metadata at the top level when a body envelope is present', async () => {
    assert.strictEqual(await runWith({ source: 'aws.events', body: { 'probe.value': 'enveloped' } }), 'enveloped');
  });
});

describe('GOScript.createLambdaHandler event-loop detach', () => {
  it('sets callbackWaitsForEmptyEventLoop = false on the Lambda context', async () => {
    const script = new GOScript({
      metadata: { name: 'detach test', version: '1.0.0', description: 'detach', authors: ['test'] },
      config: { parameters: [] },
      logging: { console: false, file: false },
    });
    const handler = script.createLambdaHandler(async () => {
      await Promise.resolve();
    });
    const context = { awsRequestId: 'req-1', callbackWaitsForEmptyEventLoop: true };

    // Run the handler; the flag is flipped synchronously before any await, so it
    // holds regardless of how the lifecycle resolves.
    await handler(undefined, context).catch(() => undefined);

    assert.strictEqual(context.callbackWaitsForEmptyEventLoop, false);
  });

  it('does not throw when invoked without a context (local / test invocation)', async () => {
    const script = new GOScript({
      metadata: { name: 'detach test no ctx', version: '1.0.0', description: 'detach', authors: ['test'] },
      config: { parameters: [] },
      logging: { console: false, file: false },
    });
    const handler = script.createLambdaHandler(async () => {
      await Promise.resolve();
    });

    await assert.doesNotReject(handler(undefined));
  });
});
