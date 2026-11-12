import type { GOLogger } from '@pagopa/go-common/logging';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';
import type { ServiceRegistry } from '@pagopa/go-runbook';

export interface ExecuteRunbookDeps {
  readonly watchtower: WatchtowerClient;
  readonly logger: GOLogger;
  readonly services: ServiceRegistry;
  readonly awsProfiles: ReadonlyArray<string>;
  readonly useConfiguredAwsProfiles: boolean;
  readonly workerArtifactRevision?: string;
}
