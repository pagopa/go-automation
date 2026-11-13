/**
 * @pagopa/go-aws/ecs — requires the peer `@aws-sdk/client-ecs`.
 */

export { ECS_CLIENT } from './ECS_CLIENT.js';
export { AWSECSService } from './AWSECSService.js';
export type { ECSClusterHealthReport, ECSServiceHealth, ECSTaskHealth } from './models/ECSClusterHealth.js';
export type { ECSClient } from '@aws-sdk/client-ecs';
