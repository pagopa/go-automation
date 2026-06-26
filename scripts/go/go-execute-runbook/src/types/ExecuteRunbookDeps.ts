import type { Core } from '@go-automation/go-common';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { ServiceRegistry } from '@go-automation/go-runbook';

export interface ExecuteRunbookDeps {
  readonly watchtower: WatchtowerClient;
  readonly logger: Core.GOLogger;
  readonly services: ServiceRegistry;
  readonly awsProfiles: ReadonlyArray<string>;
  readonly useConfiguredAwsProfiles: boolean;
}
