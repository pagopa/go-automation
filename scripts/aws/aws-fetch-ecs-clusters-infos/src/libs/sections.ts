import { Core } from '@go-automation/go-common';
import type { ConfigFileItem } from '../types/ConfigFile.js';
import { AWSSSMService, AWSECSService, AWSSchedulerService } from '@go-automation/go-common/aws';

export async function getAndPrintEcsClustersStatus(
  script: Core.GOScript,
  item: ConfigFileItem,
): Promise<Record<string, unknown>[]> {
  const tableRows: Record<string, unknown>[] = [];
  if (!item.clusters || item.clusters.length === 0) {
    script.logger.text(`No ECS clusters in config file for "${item.profile}" profile.`);
    return tableRows;
  }

  const ecsService = new AWSECSService(script.aws.clients.get(item.profile).ecs);
  for (const clstr of item.clusters) {
    let describeClusterOutput;
    try {
      describeClusterOutput = await ecsService.describeCluster([clstr]);
    } catch (error) {
      script.logger.warning(
        `Failed to get detail for cluster ${clstr} and profile ${item.profile}: ${(error as Error).name}`,
      );
    }

    const clusterProperties = describeClusterOutput?.clusters?.[0];
    if (!clusterProperties) {
      script.logger.warning(`Something goes wrong retriving ${clstr} infos. Skipped.`);
      continue;
    }

    let status = 'UNDEFINED';
    if (clusterProperties.pendingTasksCount !== undefined && clusterProperties.runningTasksCount !== undefined) {
      status =
        clusterProperties.pendingTasksCount + clusterProperties.runningTasksCount === 0 ? 'NOT ACTIVE' : 'ACTIVE';
    }
    tableRows.push({
      clusterName: clusterProperties.clusterName,
      status,
      pendingTasksCount: clusterProperties.pendingTasksCount,
      runningTasksCount: clusterProperties.runningTasksCount,
    });
  }
  return tableRows;
}

export async function getAndPrintScheduledActions(
  script: Core.GOScript,
  item: ConfigFileItem,
): Promise<Record<string, unknown>[]> {
  const tableRows: Record<string, unknown>[] = [];
  if (!item.rules || item.rules.length === 0) {
    script.logger.text(`No scheduled actions in config file for "${item.profile}" profile.`);
    return tableRows;
  }
  const schedulerService = new AWSSchedulerService(script.aws.clients.get(item.profile).scheduler);
  for (const rule of item.rules) {
    try {
      const schedule = await schedulerService.getSchedule(rule);
      tableRows.push({
        ruleName: rule,
        state: schedule.State,
        expression: schedule.ScheduleExpression,
        timezone: schedule.ScheduleExpressionTimezone,
      });
    } catch (error) {
      script.logger.warning(`Failed to get schedule details for rule ${rule}: ${(error as Error).name}`);
    }
  }
  return tableRows;
}

export async function getAndPrintSSMParametersValues(
  script: Core.GOScript,
  item: ConfigFileItem,
): Promise<Record<string, unknown>[]> {
  const tableRows: Record<string, unknown>[] = [];
  if (!item.ssmParameters || item.ssmParameters.length === 0) {
    script.logger.text(`No ssmParameter in config file for "${item.profile}" profile.`);
    return tableRows;
  }
  const ssmParameterService = new AWSSSMService(script.aws.clients.get(item.profile).ssm);
  for (const ssmParameterName of item.ssmParameters) {
    try {
      const ssmParameterValue = (await ssmParameterService.getParameterStoreValue(ssmParameterName, false)) ?? '';
      tableRows.push({ name: ssmParameterName, value: ssmParameterValue });
    } catch (error) {
      script.logger.warning(
        `Failed to get SSM parameter ${ssmParameterName} for profile ${item.profile}: ${(error as Error).name}`,
      );
    }
  }
  return tableRows;
}
