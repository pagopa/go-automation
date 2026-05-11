/**
 * Go Search Jira - Main Logic Module
 *
 * Dispatches to the sub-command selected by `--action`.
 */
import { Core } from '@go-automation/go-common';

import { CleanCommand } from './commands/CleanCommand.js';
import { SearchCommand } from './commands/SearchCommand.js';
import { StatusCommand } from './commands/StatusCommand.js';
import { SyncCommand } from './commands/SyncCommand.js';
import type { GoSearchJiraConfig } from './types/GoSearchJiraConfig.js';
import { GoSearchJiraAction } from './types/GoSearchJiraAction.js';

/**
 * Main script execution function
 *
 * @param script - The GOScript instance for logging, prompts and config
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoSearchJiraConfig>();
  script.logger.section('Go Search Jira');
  script.logger.info(`Action: ${config.action}`);

  switch (config.action) {
    case GoSearchJiraAction.SYNC:
      await new SyncCommand().execute(script, config);
      return;
    case GoSearchJiraAction.SEARCH:
      await new SearchCommand().execute(script, config);
      return;
    case GoSearchJiraAction.STATUS:
      await new StatusCommand().execute(script, config);
      return;
    case GoSearchJiraAction.CLEAN:
      await new CleanCommand().execute(script, config);
      return;
    default:
      script.logger.error(`Unknown action: "${String(config.action)}". Valid actions: sync | search | status | clean.`);
      throw new Error(`Unknown action: ${String(config.action)}`);
  }
}
