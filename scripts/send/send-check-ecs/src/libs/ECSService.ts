import {
  ECSClient,
  ListClustersCommand,
  DescribeClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  ListTasksCommand,
  DescribeTasksCommand,
} from '@aws-sdk/client-ecs';
import type { Service, Task } from '@aws-sdk/client-ecs';

import type { ClusterHealthReport, ServiceHealth, TaskHealth } from '../types/index.js';

/**
 * Servizio per l'interazione con AWS ECS
 * Implementa la logica di discovery e analisi della salute dei cluster
 */
export class ECSService {
  constructor(private readonly client: ECSClient) {}

  /**
   * Recupera la lista degli ARN dei cluster ECS, opzionalmente filtrati per nome
   * Complexity: O(1) chiamate API (paginazione non gestita per semplicita, assume < 100 cluster)
   *
   * @param filter - Array di stringhe per filtrare i nomi dei cluster
   * @returns Lista di ARN dei cluster
   *
   * @example
   * ```typescript
   * const service = new ECSService(client);
   * const clusters = await service.listClusters(['prod', 'uat']);
   * ```
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
   * Esegue un'analisi completa della salute di un cluster (servizi e task)
   * Complexity: O(S/10 + T/100) chiamate API dove S e il numero di servizi e T il numero di task
   *
   * @param clusterArn - ARN del cluster da analizzare
   * @returns Report dettagliato sulla salute del cluster
   *
   * @example
   * ```typescript
   * const report = await service.checkCluster('arn:aws:ecs:eu-south-1:123:cluster/my-cluster');
   * if (!report.isHealthy) console.log('Cluster has issues');
   * ```
   */
  async checkCluster(clusterArn: string): Promise<ClusterHealthReport> {
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
      // Batch by 10
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
      // Batch by 100
      for (let i = 0; i < taskArns.length; i += 100) {
        const batch = taskArns.slice(i, i + 100);
        const descTasks = await this.client.send(new DescribeTasksCommand({ cluster: clusterArn, tasks: batch }));
        if (descTasks.tasks) {
          tasks.push(...descTasks.tasks);
        }
      }
    }

    // Analyze
    const serviceHealths: ServiceHealth[] = services.map((s) => {
      const runningCount = s.runningCount ?? 0;
      const desiredCount = s.desiredCount ?? 0;
      const status = s.status ?? 'UNKNOWN';
      const serviceName = s.serviceName ?? 'unknown';

      // Basic health check: running matches desired and status is ACTIVE
      const isHealthy = runningCount === desiredCount && status === 'ACTIVE';

      return {
        serviceName,
        status,
        runningCount,
        desiredCount,
        isHealthy,
      };
    });

    const taskHealths: TaskHealth[] = tasks.map((t) => {
      const lastStatus = t.lastStatus ?? 'UNKNOWN';
      const healthStatus = t.healthStatus ?? 'UNKNOWN';

      // Basic health check: running and healthy (if health check exists)
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

    // Cluster is healthy if active and all services/tasks are healthy
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
