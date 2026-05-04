import { Core, AWS } from '@go-automation/go-common';

export function logClusterHeader(script: Core.GOScript, report: AWS.ECSClusterHealthReport): void {
  const label = report.isHealthy ? 'HEALTHY' : 'UNHEALTHY';
  script.logger.section(`Cluster: ${report.clusterName} (${label})`);
}
