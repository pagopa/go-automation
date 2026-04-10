/**
 * go-BotQESlackHandler
 *
 * Receives Slack slash command /goai, acks immediately (<3s),
 * then invokes go-AILambda asynchronously passing the response_url.
 * go-AILambda calls Bedrock and posts the result back to Slack.
 *
 * Slack slash command syntax:
 *   /goai gherkin User can reset password via email link valid 24h
 *   /goai normal As a user I want to...
 *   /goai srs-analysis The system shall...
 *
 * Environment variables:
 *   GO_AI_LAMBDA_NAME   — name of the go-AILambda (default: go-ai-prod)
 *   SLACK_SIGNING_SECRET — used to verify Slack request signature
 *
 * API Gateway integration:
 *   Method: POST
 *   Content-Type: application/x-www-form-urlencoded (Slack default)
 */

import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as crypto from 'node:crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

const GO_AI_LAMBDA_NAME = process.env['GO_AI_LAMBDA_NAME'] ?? 'go-ai-prod';
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? '';
const AWS_REGION = process.env['AWS_REGION'] ?? 'eu-south-1';

const lambda = new LambdaClient({ region: AWS_REGION });

// ─── Available hats ───────────────────────────────────────────────────────────

const AVAILABLE_HATS = [
  'normal',
  'gherkin',
  'srs-analysis',
  'code-review',
  'runbook-assist',
  'alarm-diagnosis',
] as const;

type Hat = (typeof AVAILABLE_HATS)[number];

// ─── Channel whitelist ────────────────────────────────────────────────────────
// Loaded from env var — no rebuild needed to add/remove channels.
// Format: comma-separated channel IDs e.g. "C09PQ0MLF1N,C0585442Z39"
// If empty or not set, all channels are allowed.

function getAllowedChannels(): Set<string> {
  const raw = process.env['ALLOWED_CHANNEL_IDS'] ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// ─── Slack request verification ───────────────────────────────────────────────
// rawBody must be passed explicitly — it is the base64-decoded body,
// which is what Slack uses to compute the signature.

function verifySlackSignature(event: APIGatewayProxyEvent, rawBody: string): boolean {
  if (!SLACK_SIGNING_SECRET) return true;

  const timestamp = event.headers['x-slack-request-timestamp'] ?? '';
  const signature = event.headers['x-slack-signature'] ?? '';

  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(baseString).digest('hex');

  const expected = Buffer.from(`v0=${hmac}`);
  const received = Buffer.from(signature);

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}

// ─── Parse slash command text ─────────────────────────────────────────────────
// Input: "gherkin User can reset password via email link"
// Output: { hat: "gherkin", input: "User can reset password via email link" }

function parseText(text: string): { hat: Hat; input: string } | null {
  const trimmed = text.trim();
  const spaceIdx = trimmed.indexOf(' ');

  if (spaceIdx === -1) return null;

  const hat = trimmed.slice(0, spaceIdx).toLowerCase() as Hat;
  const input = trimmed.slice(spaceIdx + 1).trim();

  if (!AVAILABLE_HATS.includes(hat)) return null;
  if (!input) return null;

  return { hat, input };
}

// ─── Slack response helpers ───────────────────────────────────────────────────

function slackOk(text: string, ephemeral = true): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: ephemeral ? 'ephemeral' : 'in_channel',
      text,
    }),
  };
}

function slackError(text: string): APIGatewayProxyResult {
  return {
    statusCode: 200, // Slack always expects 200
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Decodifica base64 se necessario
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : (event.body ?? '');

  // 2. Verifica firma usando rawBody
  if (!verifySlackSignature(event, rawBody)) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // 3. Parse URL-encoded body from Slack
  const params = new URLSearchParams(rawBody);
  const text = params.get('text') ?? '';
  const responseUrl = params.get('response_url') ?? '';
  const userName = params.get('user_name') ?? 'unknown';
  const channelId = params.get('channel_id') ?? '';

  // 4. Check channel whitelist
  const allowedChannels = getAllowedChannels();
  if (allowedChannels.size > 0 && !allowedChannels.has(channelId)) {
    return slackError('❌ /goai non è disponibile in questo canale.');
  }

  // 5. Validate hat and input
  const parsed = parseText(text);
  if (!parsed) {
    const hats = AVAILABLE_HATS.join(' | ');
    return slackError(
      `❌ Sintassi non valida.\n\nUso: \`/goai [hat] [testo]\`\nHat disponibili: \`${hats}\`\n\nEsempio: \`/goai gherkin L'utente può resettare la password\``,
    );
  }

  // 6. Ack immediately to Slack (must be < 3s)
  // Fire-and-forget: invoke go-AILambda async, then return ack
  const goAIPayload = {
    hat: parsed.hat,
    input: parsed.input,
    responseUrl, // go-AILambda posts back here when done
    userName,
  };

  // Async invocation — Lambda returns immediately, does not wait for result
  await lambda.send(
    new InvokeCommand({
      FunctionName: GO_AI_LAMBDA_NAME,
      InvocationType: InvocationType.Event, // async, fire-and-forget
      Payload: JSON.stringify(goAIPayload),
    }),
  );

  // 5. Return immediate ack to Slack
  return slackOk(`⏳ *GO-AI* sta elaborando con il cappello \`${parsed.hat}\`…\nRispondo tra qualche secondo.`);
};
