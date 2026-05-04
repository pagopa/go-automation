/**
 * AWS Check ECS - Show Report Library
 */

import { Core, AWS } from '@go-automation/go-common';
import { logClusterHeader } from './AwsCheckEcsLogClusterHeader.js';
import { logServices } from './AwsCheckEcsLogServices.js';
import { logTasks } from './AwsCheckEcsLogTasks.js';

/**
 * Show cluster health report
 * @param script - Script instance
 * @param report - ECS cluster health report
 */

export function awsCheckEcsShowReport(script: Core.GOScript, report: AWS.ECSClusterHealthReport): void {
  logClusterHeader(script, report);
  script.logger.info(`Status: ${report.status}`);
  script.logger.info(`ARN: ${report.clusterArn}`);
  logServices(script, report.services);
  logTasks(script, report.tasks);
}
