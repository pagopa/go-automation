import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import { GOBedrockClient, type GOAIRequest, type GOAIResponse } from '@go-automation/go-ai';

import type { GoAIClientConfig } from '../types/index.js';

export async function invokeDirect(req: GOAIRequest, config: GoAIClientConfig): Promise<GOAIResponse> {
  const client = new GOBedrockClient({
    region: config.awsRegion,
    profile: config.awsProfile,
  });
  return client.invoke(req);
}

export async function invokeLambda(req: GOAIRequest, config: GoAIClientConfig): Promise<GOAIResponse> {
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

  const body = JSON.parse(Buffer.from(response.Payload).toString('utf-8')) as GOAIResponse | { errorMessage: string };

  if (response.FunctionError) {
    const err = body as { errorMessage: string };
    throw new Error(`GO-AI Lambda error: ${err.errorMessage}`);
  }

  return body as GOAIResponse;
}
