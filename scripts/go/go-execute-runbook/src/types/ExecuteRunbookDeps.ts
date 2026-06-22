import type { AWS, Core } from '@go-automation/go-common';
import type { ServiceRegistry } from '@go-automation/go-runbook';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';

export interface ExecuteRunbookDeps {
  readonly watchtower: WatchtowerClient;
  readonly logger: Core.GOLogger;
  readonly services: ServiceRegistry;
  readonly cloudWatchLogs: AWS.AWSCloudWatchLogsService;
  readonly athena: AWS.AWSAthenaService;
}
