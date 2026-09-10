import type { ServiceAlarmConfig } from '../../service/types/ServiceAlarmConfig.js';
import type { ServiceDescriptor } from '../../service/types/ServiceDescriptor.js';
import type { DownstreamSelector } from './DownstreamSelector.js';

/**
 * Configuration of a downstream-detection runbook.
 *
 * The same shape as a service alarm, minus the query overrides: the query is
 * this toolkit's business, derived from {@link DownstreamAlarmConfig.downstream}.
 */
export interface DownstreamAlarmConfig extends Omit<ServiceAlarmConfig, 'service'> {
  /** Service whose application logs carry the downstream markers. */
  readonly service: Omit<ServiceDescriptor, 'queryOverride'>;
  /** Which downstream failures to look for. */
  readonly downstream: DownstreamSelector;
}
