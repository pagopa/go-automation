/**
 * AWS Check ECS - Log Cluster Header Library
 */

import { Core, AWS } from '@go-automation/go-common';

/**
 * Log cluster header
 * @param script - Script instance
 * @param report - ECS cluster health report
 */

export function logClusterHeader(script: Core.GOScript, report: AWS.ECSClusterHealthReport): void {
  const label = report.isHealthy ? 'HEALTHY' : 'UNHEALTHY';
  script.logger.section(`Cluster: ${report.clusterName} (${label})`);
}
