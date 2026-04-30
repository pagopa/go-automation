/**
 * ECS Cluster Health Analysis Models
 */

export interface ECSClusterHealthReport {
  readonly clusterArn: string;
  readonly clusterName: string;
  readonly status: string;
  readonly services: ReadonlyArray<ECSServiceHealth>;
  readonly tasks: ReadonlyArray<ECSTaskHealth>;
  readonly isHealthy: boolean;
}

export interface ECSServiceHealth {
  readonly serviceName: string;
  readonly status: string;
  readonly runningCount: number;
  readonly desiredCount: number;
  readonly isHealthy: boolean;
}

export interface ECSTaskHealth {
  readonly taskArn: string;
  readonly lastStatus: string;
  readonly healthStatus: string;
  readonly group: string;
  readonly isHealthy: boolean;
}
