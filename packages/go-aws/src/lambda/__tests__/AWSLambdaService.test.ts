import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvocationType, InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSLambdaService } from '../AWSLambdaService.js';

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('AWSLambdaService', () => {
  it('invokes the function synchronously with the JSON payload and parses the response', async () => {
    const client = new FakeAwsClient([{ Payload: encode('{"text":"ok","inputTokens":3}') }]);

    const response = await new AWSLambdaService(client.as<LambdaClient>()).invokeJson('go-ai-prod', {
      hat: 'summarizer',
      input: 'hello',
    });

    assert.deepStrictEqual(response, { text: 'ok', inputTokens: 3 });
    assert.deepStrictEqual(client.inputs(InvokeCommand), [
      {
        FunctionName: 'go-ai-prod',
        InvocationType: InvocationType.RequestResponse,
        Payload: '{"hat":"summarizer","input":"hello"}',
      },
    ]);
  });

  it('rejects function errors, empty payloads and non-JSON payloads', async () => {
    const cases: ReadonlyArray<readonly [object, RegExp]> = [
      [
        { FunctionError: 'Unhandled', Payload: encode('{"errorType":"Error","errorMessage":"boom"}') },
        /Lambda function 'go-ai-prod' failed \(Unhandled\): boom$/,
      ],
      [{ FunctionError: 'Unhandled', Payload: encode('Task timed out') }, /failed \(Unhandled\): Task timed out$/],
      [{}, /Empty response payload/],
      [{ Payload: encode('not-json') }, /Invalid JSON response payload/],
    ];
    for (const [output, expected] of cases) {
      const service = new AWSLambdaService(new FakeAwsClient([output]).as<LambdaClient>());
      await assert.rejects(service.invokeJson('go-ai-prod', {}), expected, String(expected));
    }
  });
});
