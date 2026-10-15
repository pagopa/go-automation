import { Core } from '@go-automation/go-common';
import type { ConfigFileItem } from '../types/ConfigFile.js';
import { AWSECSService } from '@go-automation/go-common/aws';
import type { SendFetchEcsClustersInfosConfig } from '../types/SendFetchEcsClustersInfosConfig.js';

interface MinimalClusters {
  clusterName: string | undefined;
  pendingTasksCount: number | undefined;
  runningTasksCount: number | undefined;
}

export async function getAndPrintEcsClustersStatus(
  script: Core.GOScript,
  item: ConfigFileItem,
  config: SendFetchEcsClustersInfosConfig,
): Promise<MinimalClusters[] | undefined> {
  const ecsService = new AWSECSService(script.aws.clients.get(item.profile).ecs);
  const describeClusterOutput = await ecsService.describeCluster(item.clusters);
  const clusters = describeClusterOutput.clusters;
  if (!clusters) {
    script.logger.warning(
      `Ops! Something goes wrong during describeCluster operation. Skipping infos for this AWS profile...`,
    );
    return undefined;
  }
  if (clusters.length < item.clusters.length) {
    const outputClusterName = clusters.map((k) => k.clusterName);
    for (const name of item.clusters) {
      if (!outputClusterName.includes(name)) {
        script.logger.warning(
          `Cluster '${name}' not found. Check into the ${item.profile} section in ${config.configFile} for some typo. Skipping infos for this cluster...`,
        );
      }
    }
  }
  const minimalClusters: MinimalClusters[] = clusters.map((x) => {
    const item: MinimalClusters = {
      clusterName: x.clusterName,
      pendingTasksCount: x.pendingTasksCount,
      runningTasksCount: x.runningTasksCount,
    };
    return item;
  });
  return minimalClusters;
}
