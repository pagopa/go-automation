/**
 * Send Fetch Ecs Clusters Infos - Main Logic Module
 *
 * Contains the core business logic for the script.
 * Receives typed dependencies (script + config) for clean separation of concerns.
 */

import { Core } from '@go-automation/go-common';

import type { ConfigFileItem, SendFetchEcsClustersInfosConfig } from './types/index.js';
import { AWSECSService, AWSSchedulerService } from '@go-automation/go-common/aws';

/**
 * Main script execution function
 *
 * This function contains the core business logic, decoupled from
 * script initialization and configuration parsing.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting send-fetch-ecs-clusters-infos');

  // Example: Log configuration
  const config = await script.getConfiguration<SendFetchEcsClustersInfosConfig>();

  // Your business logic here

  const configFileImporter = new Core.GOJSONFileImporter({
    inputPath: config.configfile,
  });
  const configFile: ConfigFileItem[] = (await configFileImporter.import()) as ConfigFileItem[];
  // Insert a function to validate input configFile here

  // for every aws-profiles as script inputs available also into the config.json file do...
  for (const item of configFile) {
    const selectedAwsProfiles: boolean = config.awsProfiles.includes(item.profile);
    if (!selectedAwsProfiles) {
      continue;
    }
    script.logger.section(`AWS Profile ${item.profile} (${item.env})`);
    const ecsClient = new AWSECSService(script.aws.clients.get(item.profile).ecs);
    const describeClusterOutput = await ecsClient.describeCluster(item.clusters);
    const clusters = describeClusterOutput.clusters;
    if (!clusters) {
      script.logger.warning(
        `Ops! Something goes wrong during describeCluster operation. Skipping infos for this AWS profile...`,
      );
      continue;
    }
    if (clusters.length < item.clusters.length) {
      const outputClusterName = clusters.map((k) => k.clusterName);
      for (const name of item.clusters) {
        if (!outputClusterName.includes(name)) {
          script.logger.warning(
            `Cluster '${name}' not found. Check into the ${item.profile} section in ${config.configfile} for some typo. Skipping infos for this cluster...`,
          );
          continue;
        }
      }
    }
    const minimalClusters = clusters.map((x) => {
      return {
        clusterName: x.clusterName,
        pendingTasksCount: x.pendingTasksCount,
        runningTasksCount: x.runningTasksCount,
      };
    });
    script.logger.info(`Clusters state`);
    for (const cluster of minimalClusters) {
      let status;
      if (cluster.pendingTasksCount === undefined || cluster.runningTasksCount === undefined) {
        status = 'UNDEFINED';
      } else {
        status = cluster.pendingTasksCount + cluster.runningTasksCount === 0 ? 'NOT ACTIVE' : 'ACTIVE';
      }
      script.logger.text(`- ${cluster.clusterName}: ${status} - PendingTasks: ${cluster.pendingTasksCount}, RunningTasks: ${cluster.runningTasksCount}`);
    }

    if (item.rules && item.rules.length > 0) {
      script.logger.text('');
      script.logger.info('Scheduled actions');
      const schedulerService = new AWSSchedulerService(script.aws.clients.get(item.profile).scheduler);
      for (const rule of item.rules) {
        try {
          const schedule = await schedulerService.getSchedule(rule);
          script.logger.text(
            `- ${rule}: ${schedule.State} - ${schedule.ScheduleExpression} ${schedule.ScheduleExpressionTimezone}`,
          );
        } catch (error) {
          script.logger.warning(`Failed to get schedule details for rule ${rule}: ${(error as Error).message}`);
        }
      }
    }
  }
  // Empty line
  script.logger.text('');
}
