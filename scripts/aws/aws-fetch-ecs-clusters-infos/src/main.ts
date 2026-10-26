/**
 * Send Fetch Ecs Clusters Infos - Main Logic Module
 *
 * Contains the core business logic for the script.
 * Receives typed dependencies (script + config) for clean separation of concerns.
 */

import { Core } from '@go-automation/go-common';
import type { ConfigFileItem, SendFetchEcsClustersInfosConfig } from './types/index.js';
import {
  getAndPrintSSMParametersValues,
  getAndPrintEcsClustersStatus,
  getAndPrintScheduledActions,
} from './libs/sections.js';

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
    const clusterRows = await getAndPrintEcsClustersStatus(script, item);
    script.logger.simpleTable(clusterRows);

    script.logger.newline();
    script.logger.info('Scheduled actions');
    const scheduledRows = await getAndPrintScheduledActions(script, item);
    script.logger.simpleTable(scheduledRows);

    script.logger.newline();
    script.logger.info(`Useful SSM parameter key/value`);
    const ssmRows = await getAndPrintSSMParametersValues(script, item);
    script.logger.simpleTable(ssmRows);
  }
  script.logger.newline();
}
