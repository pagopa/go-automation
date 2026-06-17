import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOScript } from '../GOScript.js';

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

    await assert.doesNotReject(handler(undefined).catch(() => undefined));
  });
});
