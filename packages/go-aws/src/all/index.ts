/**
 * @pagopa/go-aws/all — composition root: aggregate providers over every service
 * except EC2. Requires all the service SDK peers listed in the package manifest
 * (EC2 excluded).
 */

export { AWSClientProvider } from './AWSClientProvider.js';
export { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
export type { AWSMultiClientProviderConfig } from './AWSMultiClientProvider.js';
export { AWSClientsProvider } from './AWSClientsProvider.js';
export { AWSServiceProvider } from './AWSServiceProvider.js';
export { AWSProvider } from './AWSProvider.js';
