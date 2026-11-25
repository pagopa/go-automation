import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { SSMClient, type GetParameterCommandOutput } from '@aws-sdk/client-ssm';

/**
 * Service for interacting with AWS Systems Manager (SSM).
 *
 * Provides methods for interacting with AWS Systems Manager Parameter Store.
 */
export class AWSSSMService {
  constructor(private readonly client: SSMClient) {}

  /**
   * Retrieves the value of a parameter from AWS Systems Manager Parameter Store.
   *
   * @param name - The name or ARN of the parameter in Parameter Store
   * @param withDecryption - Whether to decrypt SecureString parameters (defaults to true)
   * @returns The parameter value, or undefined if not set
   */
  async getParameterStoreValue(name: string, withDecryption: boolean = true): Promise<string | undefined> {
    const input = {
      Name: name,
      WithDecryption: withDecryption,
    };
    const command = new GetParameterCommand(input);
    const response: GetParameterCommandOutput = await this.client.send(command);
    return response.Parameter?.Value;
  }
}
