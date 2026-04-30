import {
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  ListClustersCommand,
  ListServicesCommand,
  ListTasksCommand,
} from '@aws-sdk/client-ecs';
import type { ECSClient, Service, Task } from '@aws-sdk/client-ecs';

import type { ECSClusterHealthReport, ECSServiceHealth, ECSTaskHealth } from './models/ECSClusterHealth.js';

/**
 * Service for interacting with Amazon ECS.
 *
 * Provides methods for cluster discovery and health analysis.
 */
export class AWSECSService {
  constructor(private readonly client: ECSClient) {}

  /**
   * Lists ECS cluster ARNs, optionally filtered by name.
   *
   * @param filter - Array of strings to filter cluster names
   * @returns List of cluster ARNs
   */
  async listClusters(filter?: ReadonlyArray<string>): Promise<ReadonlyArray<string>> {
    const command = new ListClustersCommand({});
    const response = await this.client.send(command);
    let clusters = response.clusterArns ?? [];

    if (filter && filter.length > 0) {
      clusters = clusters.filter((c) => filter.some((f) => c.includes(f)));
    }
    return clusters;
  }

  /**
   * Performs a comprehensive health analysis of an ECS cluster.
   *
   * @param clusterArn - ARN of the cluster to analyze
   * @returns Detailed cluster health report
   */
  async checkCluster(clusterArn: string): Promise<ECSClusterHealthReport> {
    // Describe Cluster
    const descCluster = await this.client.send(new DescribeClustersCommand({ clusters: [clusterArn] }));
    const cluster = descCluster.clusters?.[0];
    if (!cluster) {
      throw new Error(`Cluster ${clusterArn} not found`);
    }

    // List & Describe Services
    const services: Service[] = [];
    const listServices = await this.client.send(new ListServicesCommand({ cluster: clusterArn }));

    if (listServices.serviceArns && listServices.serviceArns.length > 0) {
      const serviceArns = listServices.serviceArns;
      // Batch by 10 (AWS API limit)
      for (let i = 0; i < serviceArns.length; i += 10) {
        const batch = serviceArns.slice(i, i + 10);
        const descServices = await this.client.send(
          new DescribeServicesCommand({ cluster: clusterArn, services: batch }),
        );
        if (descServices.services) {
          services.push(...descServices.services);
        }
      }
    }

    // List & Describe Tasks
    const tasks: Task[] = [];
    const listTasks = await this.client.send(new ListTasksCommand({ cluster: clusterArn }));

    if (listTasks.taskArns && listTasks.taskArns.length > 0) {
      const taskArns = listTasks.taskArns;
      // Batch by 100 (AWS API limit)
      for (let i = 0; i < taskArns.length; i += 100) {
        const batch = taskArns.slice(i, i + 100);
        const descTasks = await this.client.send(new DescribeTasksCommand({ cluster: clusterArn, tasks: batch }));
        if (descTasks.tasks) {
          tasks.push(...descTasks.tasks);
        }
      }
    }

    // Analyze Services
    const serviceHealths: ECSServiceHealth[] = services.map((s) => {
      const runningCount = s.runningCount ?? 0;
      const desiredCount = s.desiredCount ?? 0;
      const status = s.status ?? 'UNKNOWN';
      const serviceName = s.serviceName ?? 'unknown';

      const isHealthy = runningCount === desiredCount && status === 'ACTIVE';

      return {
        serviceName,
        status,
        runningCount,
        desiredCount,
        isHealthy,
      };
    });

    // Analyze Tasks
    const taskHealths: ECSTaskHealth[] = tasks.map((t) => {
      const lastStatus = t.lastStatus ?? 'UNKNOWN';
      const healthStatus = t.healthStatus ?? 'UNKNOWN';

      const isRunning = lastStatus === 'RUNNING';
      const isHealthCheckPassing = healthStatus === 'HEALTHY' || healthStatus === 'UNKNOWN';
      const isHealthy = isRunning && isHealthCheckPassing;

      return {
        taskArn: t.taskArn ?? 'unknown',
        lastStatus,
        healthStatus,
        group: t.group ?? 'unknown',
        isHealthy,
      };
    });

    const isClusterHealthy =
      cluster.status === 'ACTIVE' && serviceHealths.every((s) => s.isHealthy) && taskHealths.every((t) => t.isHealthy);

    return {
      clusterArn: cluster.clusterArn ?? clusterArn,
      clusterName: cluster.clusterName ?? 'unknown',
      status: cluster.status ?? 'UNKNOWN',
      services: serviceHealths,
      tasks: taskHealths,
      isHealthy: isClusterHealthy,
    };
  }
}
