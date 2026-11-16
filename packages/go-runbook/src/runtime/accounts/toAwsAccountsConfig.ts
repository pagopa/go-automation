import type { AwsAccountsBinding } from './AwsAccountsBinding.js';
import type { AwsAccountsConfig } from './AwsAccountsConfig.js';
import type { AwsAccountsSettings } from './AwsAccountsSettings.js';

const BINDINGS: ReadonlySet<string> = new Set<AwsAccountsBinding>(['profiles', 'oam']);

/**
 * Validates the raw `aws.account.*` values of a host into an {@link AwsAccountsConfig}
 * (EVO-AWSACCT-OPUS-01 §8.1). Blank values count as absent; the directory itself
 * is validated when the port is built.
 *
 * @param settings - Raw values and the host's default binding
 * @returns The account configuration
 * @throws Error when the binding is neither `profiles` nor `oam`
 *
 * @example
 * ```typescript
 * const accounts = toAwsAccountsConfig({ directory: config.awsAccountDirectory, region, defaultBinding: 'profiles' });
 * ```
 */
export function toAwsAccountsConfig(settings: AwsAccountsSettings): AwsAccountsConfig {
  const typed = settings.binding?.trim();
  const binding = typed === undefined || typed === '' ? settings.defaultBinding : typed;
  if (!BINDINGS.has(binding)) {
    throw new Error(`Invalid aws.account.binding "${binding}": expected profiles or oam`);
  }
  const environment = settings.environment?.trim();
  const permissionSets = (settings.permissionSets ?? []).map((value) => value.trim()).filter((value) => value !== '');
  return {
    directory: (settings.directory ?? []).map((entry) => entry.trim()).filter((entry) => entry !== ''),
    // Safe: checked against the known bindings above.
    binding: binding as AwsAccountsBinding,
    region: settings.region,
    ...(environment === undefined || environment === '' ? {} : { environment }),
    ...(permissionSets.length === 0 ? {} : { permissionSets }),
  };
}
