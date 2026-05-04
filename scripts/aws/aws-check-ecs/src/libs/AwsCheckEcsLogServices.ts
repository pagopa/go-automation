import { Core, AWS } from '@go-automation/go-common';

export function logServices(script: Core.GOScript, services: ReadonlyArray<AWS.ECSServiceHealth>): void {
  script.logger.step('Services');

  if (services.length === 0) {
    script.logger.info('No services found.');
    return;
  }

  for (const s of services) {
    const icon = s.isHealthy ? '✅' : '❌';
    const msg = `${icon} ${s.serviceName}: ${s.status} (Running: ${s.runningCount} / Desired: ${s.desiredCount})`;
    if (s.isHealthy) {
      script.logger.info(msg);
    } else {
      script.logger.error(msg);
    }
  }
}
