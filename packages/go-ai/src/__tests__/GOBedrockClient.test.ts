import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOBedrockClient } from '../GOBedrockClient.js';
import { GOAIHat } from '../types/index.js';

interface CapturedConverseCommand {
  readonly input?: {
    readonly messages?: ReadonlyArray<{
      readonly content?: ReadonlyArray<{ readonly text?: string }>;
    }>;
  };
}

describe('GOBedrockClient', () => {
  it('preserves dollar sequences in the prompt input', async () => {
    const client = new GOBedrockClient({ region: 'eu-south-1', modelArn: 'test-model' });
    let capturedPrompt: string | undefined;

    (
      client as unknown as {
        readonly client: {
          send(command: CapturedConverseCommand): Promise<{
            output: { message: { content: { text: string }[] } };
            usage: { inputTokens: number; outputTokens: number };
          }>;
        };
      }
    ).client.send = async (command: CapturedConverseCommand) => {
      capturedPrompt = command.input?.messages?.[0]?.content?.[0]?.text;
      await Promise.resolve();
      return {
        output: { message: { content: [{ text: 'ok' }] } },
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    const rawInput = "PID $$, regex $&, suffix $', prefix $`, amount $5";

    await client.invoke({
      hat: GOAIHat.SemanticMatch,
      input: rawInput,
    });

    assert.ok(capturedPrompt);
    assert.ok(capturedPrompt.includes(rawInput));
  });
});
