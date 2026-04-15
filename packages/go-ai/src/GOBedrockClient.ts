/**
 * GOBedrockClient
 * Core Bedrock wrapper for GO-AI module.
 * Uses the Converse API — model-agnostic, works with Nova and Claude.
 *
 * Credential resolution order:
 *   1. profile option (explicit) — used in local/script mode
 *   2. AWS_PROFILE env var       — fallback for local
 *   3. Default chain             — used in Lambda (IAM Role)
 */

import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import type { GOAIRequest, GOAIResponse } from './types/index.js';
import { GOAIHat } from './types/index.js';
import { getTemplate } from './prompts/index.js';

const DEFAULT_MODEL_ARN = 'arn:aws:bedrock:eu-south-1:170533023216:inference-profile/eu.amazon.nova-pro-v1:0';

export interface GOBedrockClientOptions {
  readonly region?: string;
  readonly modelArn?: string;
  /**
   * AWS profile name from ~/.aws/config.
   * Leave undefined in Lambda — IAM Role is used automatically.
   * In local/script mode pass explicitly or set AWS_PROFILE env var.
   */
  readonly profile?: string;
}

export class GOBedrockClient {
  private readonly client: BedrockRuntimeClient;
  private readonly modelArn: string;

  constructor(options: GOBedrockClientOptions = {}) {
    const region = options.region ?? process.env['AWS_REGION'] ?? 'eu-south-1';
    const profile = options.profile ?? process.env['AWS_PROFILE'];
    this.modelArn = options.modelArn ?? process.env['BEDROCK_MODEL_ARN'] ?? DEFAULT_MODEL_ARN;

    this.client = new BedrockRuntimeClient({
      region,
      // If profile is set, use fromIni (same pattern as go-common).
      // If not set (Lambda), the default credential chain picks up the IAM Role.
      ...(profile !== undefined && {
        credentials: fromIni({ profile }),
      }),
    });
  }

  async invoke(req: GOAIRequest): Promise<GOAIResponse> {
    const template = getTemplate(req.hat);
    const prompt = template.replace('{INPUT}', req.input);

    const input: ConverseCommandInput = {
      modelId: this.modelArn,
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: req.maxTokens ?? 2000,
        temperature: req.temperature ?? 0.3,
        topP: 0.9,
      },
    };

    const response = await this.client.send(new ConverseCommand(input));

    const output = response.output?.message?.content?.[0]?.text;
    if (!output) {
      throw new Error('Unexpected Bedrock response: no text content');
    }

    return {
      output,
      model: this.modelArn,
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      hat: req.hat,
    };
  }

  listHats(): GOAIHat[] {
    return Object.values(GOAIHat);
  }
}
