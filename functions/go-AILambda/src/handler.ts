/**
 * go-AILambda
 *
 * General-purpose AI Lambda wrapping @go-automation/go-ai.
 *
 * Invocation modes:
 *
 *   1. DIRECT (AWS CLI / other Lambdas):
 *      { "hat": "gherkin", "input": "..." }
 *      → returns GOAIResponse
 *
 *   2. FROM go-BotQESlackHandler:
 *      { "hat": "gherkin", "input": "...", "responseUrl": "https://hooks.slack.com/...", "userName": "..." }
 *      → calls Bedrock, posts result to Slack via responseUrl, returns void
 *
 * IAM permissions required:
 *   bedrock:InvokeModel on the configured model ARN
 */

import { GOBedrockClient, GOAIHat } from '@go-automation/go-ai';
import type { GOAIRequest, GOAIResponse } from '@go-automation/go-ai';

// ─── Event type ───────────────────────────────────────────────────────────────

interface GoAILambdaEvent extends GOAIRequest {
  readonly responseUrl?: string; // present when invoked from Slack handler
  readonly userName?: string;
}

// ─── Client — reused across warm invocations ──────────────────────────────────

const client = new GOBedrockClient();

// ─── Post result back to Slack ────────────────────────────────────────────────

async function postToSlack(responseUrl: string, userName: string, hat: string, response: GOAIResponse): Promise<void> {
  const output = response.output
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  // Try to pretty-print if JSON, otherwise use as-is
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    formatted = output;
  }

  const body = JSON.stringify({
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*GO-AI* · cappello \`${hat}\` · richiesto da @${userName}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`\n${formatted}\n\`\`\``,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Modello: \`${response.model}\` · ${response.inputTokens} in / ${response.outputTokens} out token`,
          },
        ],
      },
    ],
  });

  const res = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Slack post failed: ${res.status} ${await res.text()}`);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event: GoAILambdaEvent): Promise<GOAIResponse | void> => {
  if (!event.hat || !event.input) {
    throw new Error('Missing required fields: hat, input');
  }

  if (!Object.values(GOAIHat).includes(event.hat)) {
    const available = Object.values(GOAIHat).join(', ');
    throw new Error(`Unknown hat: '${event.hat}'. Available: ${available}`);
  }

  const response = await client.invoke({
    hat: event.hat,
    input: event.input,
  });

  // Slack mode: post result back via response_url
  if (event.responseUrl) {
    await postToSlack(event.responseUrl, event.userName ?? 'unknown', event.hat, response);
    return; // Slack handler doesn't need the return value
  }

  // Direct mode: return the response
  return response;
};
