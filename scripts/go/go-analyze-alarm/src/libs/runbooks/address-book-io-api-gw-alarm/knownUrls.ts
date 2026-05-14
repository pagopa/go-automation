/**
 * Known URLs derived from the JSON canonical runbook
 * (`go-runbooks/.../pn-address-book-io-IO-ApiGwAlarm.json`).
 *
 * A `target` matching a service in {@link REACHABLE_SERVICES} (or the
 * {@link ENTRY_SERVICE}) loops the analysis into that service; any other
 * target is treated as an external downstream and terminates the chain.
 */
import type { apigw } from '@go-automation/go-runbook';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: 'https://api.io.pagopa.it/api/v1/activations/',
    matchType: 'prefix',
    target: 'AppIO',
    description: 'Endpoint AppIO osservato nei log di pn-external-registries.',
  },
  {
    url: 'http://internal-EcsA-20230522152202180500000011-96161141.eu-south-1.elb.amazonaws.com:8080/ext-registry-private/io/v1/activations',
    matchType: 'prefix',
    target: 'pn-external-registries',
    description: 'Load balancer interno verso ext-registry-private/io/v1/activations.',
  },
];
