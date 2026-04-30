/**
 * ECS Check - Main Logic Module
 *
 * Checks ECS clusters, services, and tasks across multiple AWS profiles in parallel.
 */

import { Core, AWS } from '@go-automation/go-common';

import { displayClusterReport } from './libs/ECSReportDisplay.js';
import type { AwsCheckEcsConfig } from './types/index.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsCheckEcsConfig>();
  script.logger.section('ECS Check');

  if (config.ecsClusters && config.ecsClusters.length > 0) {
    script.logger.info(`Target Clusters: ${config.ecsClusters.join(', ')}`);
  } else {
    script.logger.info('Target Clusters: ALL');
  }
  script.logger.newline();

  script.prompt.spin('fetch', 'Fetching ECS data from all profiles...');

  const { results, errors } = await script.awsMulti.mapParallelSettled(async (_, clientProvider) => {
    const ecsService = new AWS.AWSECSService(clientProvider.ecs);

    const clusterArns = await ecsService.listClusters(config.ecsClusters);
    const reports = await Promise.all(clusterArns.map(async (arn) => ecsService.checkCluster(arn)));

    return reports;
  });

  script.prompt.spinSucceed('fetch', `Data fetched from ${results.size} profile${results.size > 1 ? 's' : ''}`);
  script.logger.newline();

  // Display per-profile results
  for (const [profile, reports] of results) {
    script.logger.section(`Profile: ${profile}`);
    if (reports.length === 0) {
      script.logger.info('No clusters found matching criteria.');
    } else {
      for (const report of reports) {
        displayClusterReport(script, report);
        script.logger.newline();
      }
    }
  }

  // Report failed profiles
  for (const [profile, error] of errors) {
    script.logger.section(`Profile: ${profile}`);
    script.logger.error(`Failed: ${error.message}`);
    script.logger.newline();
  }

  if (results.size === 0 && errors.size > 0) {
    throw new Error('All profiles failed. Check AWS credentials and profile names.');
  }

  script.logger.success('All checks completed.');
}
