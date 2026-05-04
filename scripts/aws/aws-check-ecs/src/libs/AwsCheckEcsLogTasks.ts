/**
 * AWS Check ECS - Log Tasks Library
 */

import { Core, AWS } from '@go-automation/go-common';

/**
 * Log tasks
 * @param script - Script instance
 * @param tasks - Array of ECS task health objects
 */

export function logTasks(script: Core.GOScript, tasks: ReadonlyArray<AWS.ECSTaskHealth>): void {
  script.logger.step('Tasks');

  if (tasks.length === 0) {
    script.logger.info('No tasks found.');
    return;
  }

  const unhealthyTasks = tasks.filter((t) => !t.isHealthy);

  if (unhealthyTasks.length === 0) {
    script.logger.success(`All ${tasks.length} tasks are healthy.`);
    return;
  }

  script.logger.warning(`${unhealthyTasks.length} unhealthy tasks found:`);
  for (const t of unhealthyTasks) {
    script.logger.warning(
      `- ${t.group} (${t.taskArn.split('/').pop()}): Status=${t.lastStatus}, Health=${t.healthStatus}`,
    );
  }
}
