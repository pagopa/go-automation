import type { AWSProfileSet } from './AWSProfileSet.js';
import { AWSAthenaService } from './AWSAthenaService.js';
import { AWSCloudWatchAlarmsService } from './AWSCloudWatchAlarmsService.js';
import { AWSCloudWatchLogsService } from './AWSCloudWatchLogsService.js';
import { AWSCloudWatchMetricsService } from './AWSCloudWatchMetricsService.js';
import { AWSDynamoDBService } from './AWSDynamoDBService.js';
import { AWSECSService } from './AWSECSService.js';
import { AWSSchedulerService } from './AWSSchedulerService.js';
import { AWSS3Service } from './AWSS3Service.js';
import { AWSSQSService } from './AWSSQSService.js';
import { AWSSecretsManagerService } from './AWSSecretsManagerService.js';

/**
 * High-level AWS service provider.
 *
 * Services are instantiated lazily on first access and backed by the profile
 * set the provider was built on. The set decides which accounts are reachable,
 * so no service here has to know what an account is: see
 * {@link AWSProvider.servicesFor} for the provider bound to one target.
 */
export class AWSServiceProvider {
  private cachedCloudWatchLogsService: AWSCloudWatchLogsService | undefined;
  private cachedCloudWatchAlarmsService: AWSCloudWatchAlarmsService | undefined;
  private cachedCloudWatchMetricsService: AWSCloudWatchMetricsService | undefined;
  private cachedDynamoDBService: AWSDynamoDBService | undefined;
  private cachedS3Service: AWSS3Service | undefined;
  private cachedSQSService: AWSSQSService | undefined;
  private cachedECSService: AWSECSService | undefined;
  private cachedAthenaService: AWSAthenaService | undefined;
  private cachedSecretsManagerService: AWSSecretsManagerService | undefined;
  private cachedSchedulerService: AWSSchedulerService | undefined;

  /**
   * @param clientProvider - The profiles these services may query
   * @param cloudWatchLogsOverride - Logs service already bound to an execution
   *   target. Composed by {@link AWSProvider} when the occurrence's account
   *   declares log-group fallbacks, because reading them needs profiles outside
   *   this (account-narrowed) set.
   */
  constructor(
    private readonly clientProvider: AWSProfileSet,
    private readonly cloudWatchLogsOverride: AWSCloudWatchLogsService | undefined = undefined,
  ) {}

  /**
   * The profiles these services may query, in resolution order.
   *
   * Callers that report what an execution actually read need the profiles the
   * set was narrowed to, not the ones configured for the whole run: on a
   * multi-account run the two differ.
   */
  get profileNames(): ReadonlyArray<string> {
    return this.clientProvider.profileNames;
  }

  get cloudWatchLogs(): AWSCloudWatchLogsService {
    this.cachedCloudWatchLogsService ??=
      this.cloudWatchLogsOverride ?? new AWSCloudWatchLogsService(this.clientProvider);
    return this.cachedCloudWatchLogsService;
  }

  get cloudWatchAlarms(): AWSCloudWatchAlarmsService {
    this.cachedCloudWatchAlarmsService ??= new AWSCloudWatchAlarmsService(this.clientProvider.first.cloudWatch);
    return this.cachedCloudWatchAlarmsService;
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

  get scheduler(): AWSSchedulerService {
    this.cachedSchedulerService ??= new AWSSchedulerService(this.clientProvider.first.scheduler);
    return this.cachedSchedulerService;
  }

  /**
   * Drops the cached services. The AWS clients belong to the profile set, which
   * is shared with every other provider built on it, so they are not destroyed.
   */
  close(): void {
    this.cachedCloudWatchLogsService = undefined;
    this.cachedCloudWatchAlarmsService = undefined;
    this.cachedCloudWatchMetricsService = undefined;
    this.cachedDynamoDBService = undefined;
    this.cachedS3Service = undefined;
    this.cachedSQSService = undefined;
    this.cachedECSService = undefined;
    this.cachedAthenaService = undefined;
    this.cachedSecretsManagerService = undefined;
    this.cachedSchedulerService = undefined;
  }
}
