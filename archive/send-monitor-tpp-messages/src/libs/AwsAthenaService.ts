/**
 * AWS Athena Service
 * Provides Athena operations using AWS SDK v3 with SSO profile support
 */

import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  type GetQueryExecutionCommandOutput,
  type GetQueryResultsCommandOutput,
} from '@aws-sdk/client-athena';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import type { AthenaServiceOptions } from '../types/AthenaServiceOptions.js';

/**
 * Service for executing Athena queries using AWS SDK v3
 * Supports both SSO profiles and default credentials chain
 */
export class AwsAthenaService {
  private readonly ssoProfile: string | null;
  private readonly region: string;
  private athenaClient: AthenaClient | null = null;

  /**
   * Creates a new Athena service instance
   * @param options - Configuration options including SSO profile and region
   */
  constructor(options: AthenaServiceOptions) {
    this.ssoProfile = options.ssoProfile;
    this.region = options.region;
  }

  /**
   * Gets or creates the Athena client instance
   * Uses SSO profile credentials if configured, otherwise default chain
   * @returns Configured Athena client
   */
  public getAthenaClient(): AthenaClient {
    if (this.athenaClient) {
      return this.athenaClient;
    }

    if (this.ssoProfile) {
      this.athenaClient = new AthenaClient({
        region: this.region,
        credentials: fromIni({ profile: this.ssoProfile }),
      });
    } else {
      this.athenaClient = new AthenaClient({ region: this.region });
    }

    return this.athenaClient;
  }

  /**
   * Gets the execution status of a query
   * @param queryExecutionId - ID of the query execution to check
   * @returns Query execution details including status
   */
  public async getQueryExecution(queryExecutionId: string): Promise<GetQueryExecutionCommandOutput> {
    const client = this.getAthenaClient();
    const command = new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId });
    return client.send(command);
  }

  /**
   * Gets query results with pagination support
   * @param queryExecutionId - ID of the completed query
   * @param nextToken - Pagination token for fetching next page
   * @returns Query results including rows and pagination token
   */
  public async getQueryResults(queryExecutionId: string, nextToken?: string): Promise<GetQueryResultsCommandOutput> {
    const client = this.getAthenaClient();
    const command = new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      NextToken: nextToken,
    });
    return client.send(command);
  }

  /**
   * Gets the configured SSO profile name
   * @returns SSO profile name or null if using default credentials
   */
  public getProfile(): string | null {
    return this.ssoProfile;
  }

  /**
   * Gets the configured AWS region
   * @returns AWS region string
   */
  public getRegion(): string {
    return this.region;
  }

  /**
   * Destroys the Athena client to release resources
   */
  public destroy(): void {
    if (this.athenaClient) {
      this.athenaClient.destroy();
      this.athenaClient = null;
    }
  }
}
