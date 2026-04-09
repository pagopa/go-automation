/**
 * GO AI Client - Main Logic Module
 *
 * Resolves the invocation mode, loads the input, and calls GO-AI.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import { Core } from '@go-automation/go-common';

import { GOBedrockClient, GOAIHat, type GOAIRequest, type GOAIResponse } from '@go-automation/go-ai';

import type { GoAIClientConfig } from './types/index.js';

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

function printHats(script: Core.GOScript): void {
  const descriptions: Record<GOAIHat, string> = {
    [GOAIHat.Normal]: 'test cases from requirement (JSON)',
    [GOAIHat.Gherkin]: 'BDD Gherkin scenarios',
    [GOAIHat.SRSAnalysis]: 'requirements, ambiguities, risks (JSON)',
    [GOAIHat.CodeReview]: 'bugs, security, best practices (JSON)',
    [GOAIHat.RunbookAssist]: 'runbook steps and improvements (JSON)',
    [GOAIHat.AlarmDiagnosis]: 'cause, severity, actions, classification (JSON)',
  };
  script.logger.section('Available hats');
  for (const [hat, desc] of Object.entries(descriptions)) {
    script.logger.text(`  ${hat.padEnd(20)} ${desc}`);
  }
}

async function invokeDirect(req: GOAIRequest, config: GoAIClientConfig): Promise<GOAIResponse> {
  const client = new GOBedrockClient({
    region: config.awsRegion,
    profile: config.awsProfile,
  });
  return client.invoke(req);
}

async function invokeLambda(req: GOAIRequest, config: GoAIClientConfig): Promise<GOAIResponse> {
  const lambda = new LambdaClient({
    region: config.awsRegion,
    credentials: fromIni({ profile: config.awsProfile }),
  });

  const command = new InvokeCommand({
    FunctionName: config.goAiLambdaName,
    InvocationType: InvocationType.RequestResponse,
    Payload: JSON.stringify(req),
  });

  const response = await lambda.send(command);

  if (!response.Payload) {
    throw new Error('Empty Lambda response');
  }

  const body = JSON.parse(Buffer.from(response.Payload).toString('utf-8')) as
    | GOAIResponse
    | { errorMessage: string };

  if (response.FunctionError) {
    const err = body as { errorMessage: string };
    throw new Error(`GO-AI Lambda error: ${err.errorMessage}`);
  }

  return body as GOAIResponse;
}

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance for logging and configuration
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoAIClientConfig>();

  if (!config.hat) {
    printHats(script);
    script.logger.text(`\nUsage: pnpm dev --hat <hat> --input '<text or path>'\n`);
    script.logger.text(`Mode:  ${config.goAiMode} (set GO_AI_MODE=lambda to route through deployed Lambda)\n`);
    return;
  }

  if (!Object.values(GOAIHat).includes(config.hat as GOAIHat)) {
    script.logger.error(`Unknown hat: '${config.hat}'`);
    printHats(script);
    process.exit(1);
  }

  if (!config.input) {
    script.logger.error('Missing input. Provide --input with a text string or a file path.');
    process.exit(1);
  }

  const req: GOAIRequest = {
    hat: config.hat as GOAIHat,
    input: loadInput(config.input),
  };

  script.logger.info(`Hat:     ${req.hat}`);
  script.logger.info(`Mode:    ${config.goAiMode}`);
  script.logger.info(`Profile: ${config.awsProfile}`);
  script.logger.info(`Input:   ${req.input.length} chars`);

  const response =
    config.goAiMode === 'lambda' ? await invokeLambda(req, config) : await invokeDirect(req, config);

  script.logger.info(`${response.inputTokens} in / ${response.outputTokens} out tokens`);

  const parsed = stabilize(response.output);
  console.log(JSON.stringify(parsed, null, 2));
}
