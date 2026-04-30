import { Core, AWS } from '@go-automation/go-common';

/**
 * Funzione per la visualizzazione a console del report di salute di un cluster ECS
 * Utilizza il logger di GOScript per formattare l'output con sezioni e colori
 *
 * @param script - Istanza GOScript per il logging
 * @param report - Report di salute del cluster da visualizzare
 *
 * @example
 * ```typescript
 * displayClusterReport(script, clusterReport);
 * ```
 */
export function displayClusterReport(script: Core.GOScript, report: AWS.ECSClusterHealthReport): void {
  if (report.isHealthy) {
    script.logger.section(`Cluster: ${report.clusterName} (HEALTHY)`);
  } else {
    script.logger.section(`Cluster: ${report.clusterName} (UNHEALTHY)`);
  }

  script.logger.info(`Status: ${report.status}`);
  script.logger.info(`ARN: ${report.clusterArn}`);

  script.logger.step('Services');
  if (report.services.length > 0) {
    for (const s of report.services) {
      const icon = s.isHealthy ? '✅' : '❌';
      const msg = `${icon} ${s.serviceName}: ${s.status} (Running: ${s.runningCount} / Desired: ${s.desiredCount})`;
      if (s.isHealthy) {
        script.logger.info(msg);
      } else {
        script.logger.error(msg);
      }
    }
  } else {
    script.logger.info('No services found.');
  }

  script.logger.step('Tasks');
  if (report.tasks.length > 0) {
    const unhealthyTasks = report.tasks.filter((t) => !t.isHealthy);
    if (unhealthyTasks.length > 0) {
      script.logger.warning(`${unhealthyTasks.length} unhealthy tasks found:`);
      for (const t of unhealthyTasks) {
        script.logger.warning(
          `- ${t.group} (${t.taskArn.split('/').pop()}): Status=${t.lastStatus}, Health=${t.healthStatus}`,
        );
      }
    } else {
      script.logger.success(`All ${report.tasks.length} tasks are healthy.`);
    }
  } else {
    script.logger.info('No tasks found.');
  }
}
