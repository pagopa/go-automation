import type { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
import { AWSAthenaService } from './AWSAthenaService.js';
import { AWSCloudWatchLogsService } from './AWSCloudWatchLogsService.js';
import { AWSCloudWatchMetricsService } from './AWSCloudWatchMetricsService.js';
import { AWSDynamoDBService } from './AWSDynamoDBService.js';
import { AWSECSService } from './AWSECSService.js';
import { AWSS3Service } from './AWSS3Service.js';
import { AWSSQSService } from './AWSSQSService.js';

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
  private readonly cachedAthenaServices = new Map<string, AWSAthenaService>();

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

  getAthena(outputLocation: string): AWSAthenaService {
    const cached = this.cachedAthenaServices.get(outputLocation);
    if (cached !== undefined) {
      return cached;
    }

    const service = new AWSAthenaService(this.clientProvider.first.athena, outputLocation);
    this.cachedAthenaServices.set(outputLocation, service);
    return service;
  }

  athena(outputLocation: string): AWSAthenaService {
    return this.getAthena(outputLocation);
  }

  close(): void {
    this.cachedCloudWatchLogsService = undefined;
    this.cachedCloudWatchMetricsService = undefined;
    this.cachedDynamoDBService = undefined;
    this.cachedS3Service = undefined;
    this.cachedSQSService = undefined;
    this.cachedECSService = undefined;
    this.cachedAthenaServices.clear();
  }
}
