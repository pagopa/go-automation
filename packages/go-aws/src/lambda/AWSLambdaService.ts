/**
 * AWS Lambda Service for synchronous function invocation
 *
 * Provides a provider-agnostic wrapper around LambdaClient.
 * Works with both AWSClientProvider (SSO) and Lambda execution role credentials.
 */

import { InvocationType, InvokeCommand } from '@aws-sdk/client-lambda';
import type { LambdaClient } from '@aws-sdk/client-lambda';

/**
 * Service for invoking AWS Lambda functions with JSON payloads.
 *
 * Takes a LambdaClient as constructor dependency — does not manage credentials.
 * Use AWSClientProvider.lambda or create a standalone LambdaClient.
 *
 * @example
 * ```typescript
 * const lambda = new AWSLambdaService(script.aws.clients.lambda);
 * const response = await lambda.invokeJson('my-function', { input: 'hello' });
 * ```
 */
export class AWSLambdaService {
  constructor(private readonly client: LambdaClient) {}

  /**
   * Invokes a Lambda function synchronously (RequestResponse) with a JSON
   * payload and returns the parsed JSON response.
   * Complexity: O(1) — single Invoke call
   *
   * @param functionName - Function name, ARN or alias ARN
   * @param payload - Value serialized as the JSON event payload
   * @returns The parsed JSON response payload (validate it at the call site)
   * @throws Error if the function fails, returns an empty payload or a non-JSON payload
   */
  async invokeJson(functionName: string, payload: unknown): Promise<unknown> {
    const response = await this.client.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: InvocationType.RequestResponse,
        Payload: JSON.stringify(payload),
      }),
    );

    const rawPayload =
      response.Payload !== undefined && response.Payload.length > 0
        ? Buffer.from(response.Payload).toString('utf-8')
        : undefined;

    if (response.FunctionError !== undefined) {
      throw new Error(
        `Lambda function '${functionName}' failed (${response.FunctionError}): ${this.extractErrorMessage(rawPayload)}`,
      );
    }

    if (rawPayload === undefined) {
      throw new Error(`Empty response payload from Lambda function '${functionName}'`);
    }

    try {
      return JSON.parse(rawPayload) as unknown;
    } catch {
      throw new Error(`Invalid JSON response payload from Lambda function '${functionName}'`);
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Extracts the errorMessage of a function error payload
   * ({ errorMessage, errorType, stackTrace }), falling back to the raw payload
   */
  private extractErrorMessage(rawPayload: string | undefined): string {
    if (rawPayload === undefined) {
      return 'no error details';
    }

    try {
      const parsed: unknown = JSON.parse(rawPayload);
      if (typeof parsed === 'object' && parsed !== null && 'errorMessage' in parsed) {
        const { errorMessage } = parsed;
        if (typeof errorMessage === 'string') {
          return errorMessage;
        }
      }
    } catch {
      // Not JSON: fall through to the raw payload
    }

    return rawPayload;
  }
}
