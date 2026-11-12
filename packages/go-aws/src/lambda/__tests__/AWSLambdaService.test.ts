import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvocationType, InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';

import { AWSLambdaService } from '../AWSLambdaService.js';

interface FakeInvokeOutput {
  readonly Payload?: Uint8Array;
  readonly FunctionError?: string;
}

interface FakeLambdaClient {
  readonly client: LambdaClient;
  readonly sentCommands: InvokeCommand[];
}

function createFakeLambdaClient(output: FakeInvokeOutput): FakeLambdaClient {
  const sentCommands: InvokeCommand[] = [];
  const client = {
    send: async (command: InvokeCommand) => {
      sentCommands.push(command);
      await Promise.resolve();
      return output;
    },
  } as unknown as LambdaClient;
  return { client, sentCommands };
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('AWSLambdaService', () => {
  it('invokes the function synchronously with the JSON payload and parses the response', async () => {
    const fake = createFakeLambdaClient({ Payload: encode('{"text":"ok","inputTokens":3}') });
    const service = new AWSLambdaService(fake.client);

    const response = await service.invokeJson('go-ai-prod', { hat: 'summarizer', input: 'hello' });

    assert.deepStrictEqual(response, { text: 'ok', inputTokens: 3 });
    assert.strictEqual(fake.sentCommands.length, 1);
    assert.ok(fake.sentCommands[0] instanceof InvokeCommand);
    assert.deepStrictEqual(fake.sentCommands[0].input, {
      FunctionName: 'go-ai-prod',
      InvocationType: InvocationType.RequestResponse,
      Payload: '{"hat":"summarizer","input":"hello"}',
    });
  });

  it('throws with the errorMessage when the function fails', async () => {
    const fake = createFakeLambdaClient({
      FunctionError: 'Unhandled',
      Payload: encode('{"errorType":"Error","errorMessage":"boom"}'),
    });
    const service = new AWSLambdaService(fake.client);

    await assert.rejects(service.invokeJson('go-ai-prod', {}), {
      message: "Lambda function 'go-ai-prod' failed (Unhandled): boom",
    });
  });

  it('falls back to the raw payload when the function error is not JSON', async () => {
    const fake = createFakeLambdaClient({ FunctionError: 'Unhandled', Payload: encode('Task timed out') });
    const service = new AWSLambdaService(fake.client);

    await assert.rejects(service.invokeJson('go-ai-prod', {}), {
      message: "Lambda function 'go-ai-prod' failed (Unhandled): Task timed out",
    });
  });

  it('throws when the response payload is empty', async () => {
    const fake = createFakeLambdaClient({});
    const service = new AWSLambdaService(fake.client);

    await assert.rejects(service.invokeJson('go-ai-prod', {}), /Empty response payload/);
  });

  it('throws when the response payload is not JSON', async () => {
    const fake = createFakeLambdaClient({ Payload: encode('not-json') });
    const service = new AWSLambdaService(fake.client);

    await assert.rejects(service.invokeJson('go-ai-prod', {}), /Invalid JSON response payload/);
  });
});
