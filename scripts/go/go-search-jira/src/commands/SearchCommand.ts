/**
 * Implements the `--action search` flow.
 *
 * Opens the index in read-only mode, builds a `JiraClient` purely for URL
 * generation (no network call required), runs the search and exports the
 * result list to a file via the go-common exporters. The output file path
 * and format are taken from `--output-file` / `--output-format`.
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Core } from '@go-automation/go-common';

import { JiraClient } from '../jira/JiraClient.js';
import { SearchService } from '../search/SearchService.js';
import { exportSearchResults } from '../search/SearchResultExporter.js';
import { AttachmentRepository } from '../storage/AttachmentRepository.js';
import { closeIndex, openIndex } from '../storage/IndexLifecycle.js';
import type { GoSearchJiraConfig } from '../types/GoSearchJiraConfig.js';

export class SearchCommand {
  public async execute(script: Core.GOScript, config: GoSearchJiraConfig): Promise<void> {
    if (config.searchQuery.trim().length === 0) {
      script.logger.error('search action requires --search-query (or -q)');
      throw new Error('Empty search query');
    }
    if (config.jiraUrl.length === 0) {
      script.logger.warning('jira.url is not set: result issueUrl will be empty. Configure it for clickable links.');
    }

    const dataDir =
      config.storageDataDir.length > 0
        ? script.paths.resolvePathWithInfo(config.storageDataDir, Core.GOPathType.OUTPUT).path
        : script.paths.getDataDir();
    const dbPath = path.join(dataDir, config.storageIndexFileName);
    if (!(await fileExists(dbPath))) {
      script.logger.error(`Index not found at ${dbPath}. Run \`--action sync\` first.`);
      throw new Error('Index missing');
    }

    const today = new Date().toISOString().slice(0, 10);
    const extension = Core.GO_EXPORT_FORMAT_EXTENSIONS[config.outputFormat];
    const requestedOutputFile =
      config.outputFile.length > 0 ? config.outputFile : `go-search-jira_${today}.${extension}`;
    const outputPathInfo = script.paths.resolvePathWithInfo(requestedOutputFile, Core.GOPathType.OUTPUT);

    script.logger.section('Search');
    script.logger.info(`Query:         ${config.searchQuery}`);
    script.logger.info(`Mode:          ${config.searchMode}`);
    script.logger.info(`Limit:         ${config.searchLimit}`);
    if (config.searchProject.length > 0) {
      script.logger.info(`Project:       ${config.searchProject}`);
    }
    if (outputPathInfo.isAbsolute) {
      script.logger.info(`Output file:   ${outputPathInfo.path}`);
    } else {
      script.logger.info(`Output dir:    ${outputPathInfo.resolvedDir}`);
      script.logger.info(`Output file:   ${outputPathInfo.path}`);
    }
    script.logger.info(`Output format: ${config.outputFormat}`);

    const index = await openIndex({
      dataDir,
      indexFileName: config.storageIndexFileName,
      readonly: true,
    });
    try {
      const repository = new AttachmentRepository(index);
      // The Jira client only needs baseUrl + a placeholder authorization header
      // for URL building (no network call is made). We pass a dummy header.
      const client = new JiraClient({
        baseUrl: config.jiraUrl.length > 0 ? config.jiraUrl : 'https://placeholder.invalid',
        authorizationHeader: 'Basic <unused>',
      });

      const service = new SearchService({
        index,
        repository,
        client,
        baseUrl: config.jiraUrl,
      });

      const results = service.search({
        query: config.searchQuery,
        mode: config.searchMode === 'literal' ? 'literal' : 'full-text',
        limit: config.searchLimit,
        project: config.searchProject,
      });

      script.logger.info(`Results:       ${results.length}`);
      if (results.length === 0) {
        script.logger.info('No results found. Output file not written.');
        return;
      }

      script.logger.section('Exporting results');
      await exportSearchResults(script, results, outputPathInfo.path, config.outputFormat);
    } finally {
      await closeIndex(index);
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
