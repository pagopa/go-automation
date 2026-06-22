import type { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
import { AWSAthenaService } from './AWSAthenaService.js';
import { AWSCloudWatchLogsService } from './AWSCloudWatchLogsService.js';
import { AWSCloudWatchMetricsService } from './AWSCloudWatchMetricsService.js';
import { AWSDynamoDBService } from './AWSDynamoDBService.js';
import { AWSECSService } from './AWSECSService.js';
import { AWSS3Service } from './AWSS3Service.js';
import { AWSSQSService } from './AWSSQSService.js';
import { AWSSecretsManagerService } from './AWSSecretsManagerService.js';

/**
 * High-level AWS service provider.
 *
 * Services are instantiated lazily on first access and backed by the
 * shared multi-client provider.
 */
export class AWSServiceProvider {
  private cachedCloudWatchLogsService: AWSCloudWatchLogsService | undefined;
  private cachedCloudWatchMetricsService: AWSCloudWatchMetricsService | undefined;
  private cachedDynamoDBService: AWSDynamoDBService | undefined;
  private cachedS3Service: AWSS3Service | undefined;
  private cachedSQSService: AWSSQSService | undefined;
  private cachedECSService: AWSECSService | undefined;
  private cachedAthenaService: AWSAthenaService | undefined;
  private cachedSecretsManagerService: AWSSecretsManagerService | undefined;

  constructor(private readonly clientProvider: AWSMultiClientProvider) {}

  get cloudWatchLogs(): AWSCloudWatchLogsService {
    this.cachedCloudWatchLogsService ??= new AWSCloudWatchLogsService(this.clientProvider);
    return this.cachedCloudWatchLogsService;
  }

  get cloudWatchMetrics(): AWSCloudWatchMetricsService {
    this.cachedCloudWatchMetricsService ??= new AWSCloudWatchMetricsService(this.clientProvider.first.cloudWatch);
    return this.cachedCloudWatchMetricsService;
  }

  get dynamoDB(): AWSDynamoDBService {
    this.cachedDynamoDBService ??= new AWSDynamoDBService(this.clientProvider.first.dynamoDB);
    return this.cachedDynamoDBService;
  }

  get s3(): AWSS3Service {
    this.cachedS3Service ??= new AWSS3Service(this.clientProvider.first.s3);
    return this.cachedS3Service;
  }

  get sqs(): AWSSQSService {
    this.cachedSQSService ??= new AWSSQSService(this.clientProvider.first.sqs, this.clientProvider.first.cloudWatch);
    return this.cachedSQSService;
  }

  get ecs(): AWSECSService {
    this.cachedECSService ??= new AWSECSService(this.clientProvider.first.ecs);
    return this.cachedECSService;
  }

  get athena(): AWSAthenaService {
    this.cachedAthenaService ??= new AWSAthenaService(this.clientProvider.first.athena);
    return this.cachedAthenaService;
  }

  getAthena(): AWSAthenaService {
    return this.athena;
  }

  get secretsManager(): AWSSecretsManagerService {
    this.cachedSecretsManagerService ??= new AWSSecretsManagerService(this.clientProvider.first.secretsManager);
    return this.cachedSecretsManagerService;
  }

  close(): void {
    this.cachedCloudWatchLogsService = undefined;
    this.cachedCloudWatchMetricsService = undefined;
    this.cachedDynamoDBService = undefined;
    this.cachedS3Service = undefined;
    this.cachedSQSService = undefined;
    this.cachedECSService = undefined;
    this.cachedAthenaService = undefined;
    this.cachedSecretsManagerService = undefined;
  }
}
