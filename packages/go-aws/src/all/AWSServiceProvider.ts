import type { AWSProfileSet } from '../AWSProfileSet.js';
import { ATHENA_CLIENT } from '../athena/ATHENA_CLIENT.js';
import { CLOUDWATCH_CLIENT } from '../cloudwatch-metrics/CLOUDWATCH_CLIENT.js';
import { DYNAMODB_CLIENT } from '../dynamodb/DYNAMODB_CLIENT.js';
import { ECS_CLIENT } from '../ecs/ECS_CLIENT.js';
import { S3_CLIENT } from '../s3/S3_CLIENT.js';
import { SCHEDULER_CLIENT } from '../scheduler/SCHEDULER_CLIENT.js';
import { SECRETS_MANAGER_CLIENT } from '../secrets-manager/SECRETS_MANAGER_CLIENT.js';
import { SQS_CLIENT } from '../sqs/SQS_CLIENT.js';
import { SSM_CLIENT } from '../ssm/SSM_CLIENT.js';
import { AWSAthenaService } from '../athena/AWSAthenaService.js';
import { AWSCloudWatchAlarmsService } from '../cloudwatch-alarms/AWSCloudWatchAlarmsService.js';
import { AWSCloudWatchLogsService } from '../cloudwatch-logs/AWSCloudWatchLogsService.js';
import { AWSCloudWatchMetricsService } from '../cloudwatch-metrics/AWSCloudWatchMetricsService.js';
import { AWSDynamoDBService } from '../dynamodb/AWSDynamoDBService.js';
import { AWSECSService } from '../ecs/AWSECSService.js';
import { AWSSchedulerService } from '../scheduler/AWSSchedulerService.js';
import { AWSS3Service } from '../s3/AWSS3Service.js';
import { AWSSQSService } from '../sqs/AWSSQSService.js';
import { AWSSecretsManagerService } from '../secrets-manager/AWSSecretsManagerService.js';
import { AWSSSMService } from '../ssm/AWSSSMService.js';

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
  private cachedSSMService: AWSSSMService | undefined;

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
    this.cachedCloudWatchAlarmsService ??= new AWSCloudWatchAlarmsService(
      this.clientProvider.first.client(CLOUDWATCH_CLIENT),
    );
    return this.cachedCloudWatchAlarmsService;
  }

  get cloudWatchMetrics(): AWSCloudWatchMetricsService {
    this.cachedCloudWatchMetricsService ??= new AWSCloudWatchMetricsService(
      this.clientProvider.first.client(CLOUDWATCH_CLIENT),
    );
    return this.cachedCloudWatchMetricsService;
  }

  get dynamoDB(): AWSDynamoDBService {
    this.cachedDynamoDBService ??= new AWSDynamoDBService(this.clientProvider.first.client(DYNAMODB_CLIENT));
    return this.cachedDynamoDBService;
  }

  get s3(): AWSS3Service {
    this.cachedS3Service ??= new AWSS3Service(this.clientProvider.first.client(S3_CLIENT));
    return this.cachedS3Service;
  }

  get sqs(): AWSSQSService {
    this.cachedSQSService ??= new AWSSQSService(
      this.clientProvider.first.client(SQS_CLIENT),
      this.clientProvider.first.client(CLOUDWATCH_CLIENT),
    );
    return this.cachedSQSService;
  }

  get ecs(): AWSECSService {
    this.cachedECSService ??= new AWSECSService(this.clientProvider.first.client(ECS_CLIENT));
    return this.cachedECSService;
  }

  get athena(): AWSAthenaService {
    this.cachedAthenaService ??= new AWSAthenaService(this.clientProvider.first.client(ATHENA_CLIENT));
    return this.cachedAthenaService;
  }

  getAthena(): AWSAthenaService {
    return this.athena;
  }

  get secretsManager(): AWSSecretsManagerService {
    this.cachedSecretsManagerService ??= new AWSSecretsManagerService(
      this.clientProvider.first.client(SECRETS_MANAGER_CLIENT),
    );
    return this.cachedSecretsManagerService;
  }

  get scheduler(): AWSSchedulerService {
    this.cachedSchedulerService ??= new AWSSchedulerService(this.clientProvider.first.client(SCHEDULER_CLIENT));
    return this.cachedSchedulerService;
  }

  get ssm(): AWSSSMService {
    this.cachedSSMService ??= new AWSSSMService(this.clientProvider.first.client(SSM_CLIENT));
    return this.cachedSSMService;
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
    this.cachedSSMService = undefined;
  }
}
