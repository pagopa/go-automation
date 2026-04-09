/**
 * go-ai-client
 * Local CLI that invokes GO-AI.
 *
 * Two modes:
 *   DIRECT  — calls Bedrock directly via @go-automation/go-ai (dev/local)
 *   LAMBDA  — invokes the deployed GO-AI Lambda via AWS Lambda invoke API
 *
 * Usage:
 *   pnpm dev                               → list available hats
 *   pnpm dev gherkin ./my-srs.txt          → invoke with file
 *   pnpm dev alarm-diagnosis "pn-DLQ..."   → invoke with raw string
 *
 * Set GO_AI_MODE=lambda to route through the deployed Lambda.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';

import { GOBedrockClient, GOAIHat, type GOAIRequest, type GOAIResponse } from '@go-automation/go-ai';

// ─── Config ───────────────────────────────────────────────────────────────────

const MODE = process.env['GO_AI_MODE'] ?? 'direct'; // 'direct' | 'lambda'
const LAMBDA_NAME = process.env['GO_AI_LAMBDA_NAME'] ?? 'go-ai-prod';
const AWS_REGION = process.env['AWS_REGION'] ?? 'eu-south-1';
const AWS_PROFILE = process.env['AWS_PROFILE'] ?? 'sso_pn-analytics';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadInput(inputArg: string): string {
  const filePath = path.resolve(inputArg);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return inputArg;
}

function stabilize(raw: string): unknown {
  const stripped = raw
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    return { text: stripped };
  }
}

function printHats(): void {
  console.log('\nAvailable hats:\n');
  const descriptions: Record<GOAIHat, string> = {
    [GOAIHat.Normal]: 'test cases from requirement (JSON)',
    [GOAIHat.Gherkin]: 'BDD Gherkin scenarios',
    [GOAIHat.SRSAnalysis]: 'requirements, ambiguities, risks (JSON)',
    [GOAIHat.CodeReview]: 'bugs, security, best practices (JSON)',
    [GOAIHat.RunbookAssist]: 'runbook steps and improvements (JSON)',
    [GOAIHat.AlarmDiagnosis]: 'cause, severity, actions, classification (JSON)',
  };
  for (const [hat, desc] of Object.entries(descriptions)) {
    console.log(`  ${hat.padEnd(20)} ${desc}`);
  }
  console.log();
}

// ─── Direct mode — calls Bedrock via go-ai package ───────────────────────────

async function invokeDirect(req: GOAIRequest): Promise<GOAIResponse> {
  const client = new GOBedrockClient({
    region: AWS_REGION,
    profile: AWS_PROFILE,
  });
  return client.invoke(req);
}

// ─── Lambda mode — calls deployed Lambda ─────────────────────────────────────

async function invokeLambda(req: GOAIRequest): Promise<GOAIResponse> {
  const lambda = new LambdaClient({ region: AWS_REGION });

  const command = new InvokeCommand({
    FunctionName: LAMBDA_NAME,
    InvocationType: InvocationType.RequestResponse,
    Payload: JSON.stringify(req),
  });

  const response = await lambda.send(command);

  if (!response.Payload) {
    throw new Error('Empty Lambda response');
  }

  const body = JSON.parse(Buffer.from(response.Payload).toString('utf-8')) as GOAIResponse | { errorMessage: string };

  if (response.FunctionError) {
    const err = body as { errorMessage: string };
    throw new Error(`GO-AI Lambda error: ${err.errorMessage}`);
  }

  return body as GOAIResponse;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , hatArg, inputArg] = process.argv;

  if (!hatArg) {
    printHats();
    console.log(`Usage: pnpm dev [hat] 'text or path/to/file'\n`);
    console.log(`Mode:  ${MODE} (set GO_AI_MODE=lambda to route through deployed Lambda)\n`);
    return;
  }

  if (!Object.values(GOAIHat).includes(hatArg as GOAIHat)) {
    console.error(`❌ Unknown hat: '${hatArg}'`);
    printHats();
    process.exit(1);
  }

  if (!inputArg) {
    console.error('❌ Missing input. Provide a text string or a file path.');
    process.exit(1);
  }

  const req: GOAIRequest = {
    hat: hatArg as GOAIHat,
    input: loadInput(inputArg),
  };

  console.error(`🔹 Hat:     ${req.hat}`);
  console.error(`🔹 Mode:    ${MODE}`);
  console.error(`🔹 Profile: ${AWS_PROFILE}`);
  console.error(`🔹 Input:   ${req.input.length} chars\n`);

  const response = MODE === 'lambda' ? await invokeLambda(req) : await invokeDirect(req);

  console.error(`✅ ${response.inputTokens} in / ${response.outputTokens} out tokens\n`);

  const parsed = stabilize(response.output);
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('❌', message);
  process.exit(1);
});
