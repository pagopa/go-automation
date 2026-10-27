import type { AWS } from '@go-automation/go-common';
import { GOBedrockClient, type GOAIRequest, type GOAIResponse } from '@go-automation/go-ai';

import type { GoAIClientConfig } from '../types/index.js';

export async function invokeDirect(req: GOAIRequest, config: GoAIClientConfig): Promise<GOAIResponse> {
  const client = new GOBedrockClient({
    region: config.awsRegion,
    profile: config.awsProfile,
  });
  return client.invoke(req);
}

export async function invokeLambda(
  req: GOAIRequest,
  config: GoAIClientConfig,
  lambda: AWS.AWSLambdaService,
): Promise<GOAIResponse> {
  try {
    return (await lambda.invokeJson(config.goAiLambdaName, req)) as GOAIResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GO-AI Lambda error: ${message}`, { cause: error });
  }
}
