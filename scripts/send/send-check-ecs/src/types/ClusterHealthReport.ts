export interface ClusterHealthReport {
  readonly clusterArn: string;
  readonly clusterName: string;
  readonly status: string;
  readonly services: ReadonlyArray<ServiceHealth>;
  readonly tasks: ReadonlyArray<TaskHealth>;
  readonly isHealthy: boolean;
}

export interface ServiceHealth {
  readonly serviceName: string;
  readonly status: string;
  readonly runningCount: number;
  readonly desiredCount: number;
  readonly isHealthy: boolean;
}

export interface TaskHealth {
  readonly taskArn: string;
  readonly lastStatus: string;
  readonly healthStatus: string;
  readonly group: string;
  readonly isHealthy: boolean;
}
