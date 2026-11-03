import * as path from 'node:path';

import { GOTextFileImporter, GOYAMLParser } from '@go-automation/go-common/core';

import type { Environment } from './Environment.js';
import type { EnvironmentDefinition } from './EnvironmentDefinition.js';
import type { EnvironmentsFile } from './EnvironmentsFile.js';
import type { EnvironmentVariableLookupFn } from './EnvironmentVariableLookupFn.js';
import { parseEnvironmentsFile } from './parseEnvironmentsFile.js';
import { processEnvironmentLookup } from './processEnvironmentLookup.js';

/**
 * Loads the environments file and resolves the selected environment (§7.4).
 *
 * Only the selected environment's API key variable is resolved, so a
 * missing variable of another environment never blocks a run.
 */
export class EnvironmentLoader {
  constructor(private readonly lookup: EnvironmentVariableLookupFn = processEnvironmentLookup) {}

  /**
   * Reads and validates an environments file (YAML or JSON, by extension).
   *
   * @param filePath - Absolute path of the file
   * @returns The validated environments
   */
  public async load(filePath: string): Promise<EnvironmentsFile> {
    const content = (await new GOTextFileImporter({ inputPath: filePath }).import()) ?? '';
    const extension = path.extname(filePath).toLowerCase();
    const parsed: unknown = extension === '.json' ? JSON.parse(content) : GOYAMLParser.parseContent(content);
    return parseEnvironmentsFile(parsed, filePath);
  }

  /**
   * Selects an environment and resolves its API key.
   *
   * @param file - Loaded environments file
   * @param name - Environment name (`--env`)
   * @returns The environment with its API key
   * @throws Error naming the environment or the variable, never the key
   */
  public resolve(file: EnvironmentsFile, name: string): Environment {
    const definition = file.environments.get(name);
    if (definition === undefined) {
      const known = [...file.environments.keys()].join(', ');
      throw new Error(`Environment "${name}" not found in ${file.source} (available: ${known})`);
    }
    return { ...definition, apiKey: this.resolveApiKey(definition) };
  }

  /**
   * Whether the API key variable of an environment is set (for `--list-envs`).
   *
   * @param definition - Environment definition
   * @returns The resolved key, or `undefined` when the variable is unset
   */
  public peekApiKey(definition: EnvironmentDefinition): string | undefined {
    const value = this.lookup(definition.apiKeyVariable);
    return value === undefined || value.trim() === '' ? undefined : value.trim();
  }

  private resolveApiKey(definition: EnvironmentDefinition): string {
    const value = this.peekApiKey(definition);
    if (value === undefined) {
      throw new Error(
        `Environment "${definition.name}": variable ${definition.apiKeyVariable} is not set ` +
          '(set it in the shell or in the GOScript .env file)',
      );
    }
    return value;
  }
}
