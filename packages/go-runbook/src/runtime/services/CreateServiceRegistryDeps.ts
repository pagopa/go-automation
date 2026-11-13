import type { AWSServiceProvider } from '@pagopa/go-aws/all';
import type { GOHttpClient } from '@pagopa/go-common/http';

/**
 * What {@link createServiceRegistry} needs to assemble a runbook service registry:
 * the AWS services and the HTTP client of the run. No dependency on the script
 * framework, so the registry can be built by any host (CLI script, Lambda, tests).
 */
export interface CreateServiceRegistryDeps {
  /** AWS services, e.g. `script.aws.services` or `new AWSProvider({ region }).services`. */
  readonly services: AWSServiceProvider;
  /** HTTP client shared across the run. */
  readonly http: GOHttpClient;
}
