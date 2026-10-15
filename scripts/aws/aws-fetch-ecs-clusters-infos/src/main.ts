/**
 * Send Fetch Ecs Clusters Infos - Main Logic Module
 *
 * Contains the core business logic for the script.
 * Receives typed dependencies (script + config) for clean separation of concerns.
 */

import { Core } from '@go-automation/go-common';
import type { ConfigFileItem, SendFetchEcsClustersInfosConfig } from './types/index.js';
import { AWSSchedulerService, AWSSSMService } from '@go-automation/go-common/aws';
import { getAndPrintEcsClustersStatus } from './libs/outputClusterStatesSections.js';

/**
 * Main script execution function
 *
 * This function contains the core business logic, decoupled from
 * script initialization and configuration parsing.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendFetchEcsClustersInfosConfig>();
  const configFileImporter = new Core.GOJSONFileImporter({
    inputPath: config.configFile,
  });
  const configFile: ConfigFileItem[] = (await configFileImporter.import()) as ConfigFileItem[];
  script.logger.section('Starting send-fetch-ecs-clusters-infos');
  for (const item of configFile) {
    const selectedAwsProfiles: boolean = config.awsProfiles.includes(item.profile);
    if (!selectedAwsProfiles) {
      continue;
    }

    script.logger.section(`AWS Profile ${item.profile} (${item.env})`);

    script.logger.newline();
    script.logger.info(`Clusters state`);
    const minimalClusters = await getAndPrintEcsClustersStatus(script, item, config);
    if (minimalClusters) {
      for (const cluster of minimalClusters) {
        let status = 'UNDEFINED';
        if (cluster.pendingTasksCount !== undefined && cluster.runningTasksCount !== undefined) {
          status = cluster.pendingTasksCount + cluster.runningTasksCount === 0 ? 'NOT ACTIVE' : 'ACTIVE';
        }
        script.logger.text(
          `- ${cluster.clusterName}: ${status} - PendingTasks: ${cluster.pendingTasksCount}, RunningTasks: ${cluster.runningTasksCount}`,
        );
      }
    }

    if (item.rules && item.rules.length > 0) {
      script.logger.newline();
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

    script.logger.newline();
    script.logger.info(`Useful SSM parameter key/value`);

    if (!item.ssmParameters || item.ssmParameters.length === 0) {
      script.logger.text(`No ssmParameter in config file for "${item.profile}" profile.`);
    } else {
      const ssmParameterService = new AWSSSMService(script.aws.clients.get(item.profile).ssm);
      for (const ssmParameterName of item.ssmParameters) {
        const ssmParameterValue = await ssmParameterService.getParameterStoreValue(ssmParameterName);
        script.logger.text(`- ${ssmParameterName}: ${ssmParameterValue}`);
      }
    }
  }
  script.logger.newline();
}
