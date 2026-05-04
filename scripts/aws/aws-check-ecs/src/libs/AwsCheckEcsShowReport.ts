import { Core, AWS } from '@go-automation/go-common';
import { logClusterHeader } from './AwsCheckEcsLogClusterHeader.js';
import { logServices } from './AwsCheckEcsLogServices.js';
import { logTasks } from './AwsCheckEcsLogTasks.js';

export function awsCheckEcsShowReport(script: Core.GOScript, report: AWS.ECSClusterHealthReport): void {
  logClusterHeader(script, report);
  script.logger.info(`Status: ${report.status}`);
  script.logger.info(`ARN: ${report.clusterArn}`);
  logServices(script, report.services);
  logTasks(script, report.tasks);
}
