import type { AWSProfileSet } from '@pagopa/go-aws';
import type { AWSServiceProvider } from '@pagopa/go-aws/all';
import type { GOHttpClient } from '@pagopa/go-common/http';

import type { AwsAccountsConfig } from '../accounts/AwsAccountsConfig.js';
import type { AwsAccountsDiagnosticFn } from '../accounts/AwsAccountsDiagnosticFn.js';

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
  /** `aws.account.*` configuration: adds the account port for runbooks that declare logical accounts (EVO-AWSACCT-OPUS-01). */
  readonly accounts?: AwsAccountsConfig;
  /** Every configured profile (e.g. `script.aws.clients`), needed by the `profiles` account binding. */
  readonly profiles?: AWSProfileSet;
  /** Local diagnostics of the account port (e.g. the script logger at debug level). */
  readonly accountDiagnostics?: AwsAccountsDiagnosticFn;
}
