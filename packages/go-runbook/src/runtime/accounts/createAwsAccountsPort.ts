import type { AWSProfileSet } from '@pagopa/go-aws';
import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { parseAwsAccountDirectory } from '@pagopa/go-aws/profiles';

import type { AwsAccountsConfig } from './AwsAccountsConfig.js';
import type { AwsAccountsDiagnosticFn } from './AwsAccountsDiagnosticFn.js';
import { RuntimeAwsAccountsPort } from './RuntimeAwsAccountsPort.js';

/**
 * Builds the account port of an execution host from its `aws.account.*`
 * configuration (EVO-AWSACCT-OPUS-01 §8.2). The port is not yet bound to an
 * occurrence: `bindServicesToOccurrence` binds it; without that, the configured
 * environment applies.
 *
 * @param config - Account configuration of the host
 * @param credentials - Every configured profile (`profiles`), the monitoring reader (`oam`) and the local diagnostic sink
 * @returns The account port
 * @throws Error when the directory is malformed or the binding lacks its credentials
 *
 * @example
 * ```typescript
 * const awsAccounts = createAwsAccountsPort(
 *   { directory: config.accountDirectory, binding: 'profiles', region: 'eu-south-1' },
 *   { profiles: script.aws.clients, monitoring: script.aws.services.cloudWatchLogs },
 * );
 * ```
 */
export function createAwsAccountsPort(
  config: AwsAccountsConfig,
  credentials: {
    readonly profiles?: AWSProfileSet;
    readonly monitoring?: AWSCloudWatchLogsQueryService;
    readonly diagnostics?: AwsAccountsDiagnosticFn;
  },
): RuntimeAwsAccountsPort {
  return new RuntimeAwsAccountsPort({
    directory: parseAwsAccountDirectory(config.directory),
    region: config.region,
    binding: config.binding,
    ...(config.environment === undefined ? {} : { environment: config.environment }),
    ...(config.permissionSets === undefined ? {} : { permissionSets: config.permissionSets }),
    ...(credentials.profiles === undefined ? {} : { profiles: credentials.profiles }),
    ...(credentials.monitoring === undefined ? {} : { monitoring: credentials.monitoring }),
    ...(credentials.diagnostics === undefined ? {} : { diagnostics: credentials.diagnostics }),
  });
}
