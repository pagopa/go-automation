import { Core } from '@go-automation/go-common';
import type { DiscoveredScript } from './discovery.js';

/**
 * Validates and informs the user about script parameters.
 * If in interactive mode, prompts for missing mandatory parameters.
 */
export async function validateAndInformParameters(
  script: DiscoveredScript,
  args: string[],
  prompt: Core.GOPrompt,
  logger: Core.GOLogger,
  isInteractive: boolean,
): Promise<{ valid: boolean; finalArgs: string[] }> {
  if (!script.parameters) {
    logger.error(`Parameters for script ${script.id} are not loaded.`);
    return { valid: false, finalArgs: args };
  }

  const parameters = script.parameters;
  const parsed = Core.GOCLIArgumentParser.parse(args);
  const finalArgs = [...args];

  console.log(`\nScript: ${script.metadata.name} (v${script.metadata.version ?? '1.0.0'})`);
  if (script.metadata.description) {
    console.log(`${script.metadata.description}\n`);
  }

  const mandatoryParams = parameters.filter((p) => p.required);
  const optionalParams = parameters.filter((p) => !p.required);

  const missingMandatory: Core.GOConfigParameterOptions[] = [];

  // Display Mandatory Parameters
  if (mandatoryParams.length > 0) {
    console.log('MANDATORY PARAMETERS:');
    for (const param of mandatoryParams) {
      const isProvided = isParamProvided(param, parsed);
      const status = isProvided ? '✔' : '✖';
      const flag = Core.GOConfigKeyTransformer.toCLIFlag(param.name);
      const value = isProvided ? formatValue(getParamValue(param, parsed)) : 'Missing!';
      console.log(`  ${status} ${flag.padEnd(25)} ${value.toString().padEnd(30)} (${param.description ?? ''})`);

      if (!isProvided) {
        missingMandatory.push(param);
      }
    }
    console.log('');
  }

  // Display Optional Parameters
  if (optionalParams.length > 0) {
    console.log('OPTIONAL PARAMETERS:');
    for (const param of optionalParams) {
      const isProvided = isParamProvided(param, parsed);
      const flag = Core.GOConfigKeyTransformer.toCLIFlag(param.name);
      let value = '[Not provided]';
      if (isProvided) {
        value = formatValue(getParamValue(param, parsed));
      } else if (param.defaultValue !== undefined) {
        value = `${formatValue(param.defaultValue)} [Default]`;
      }
      console.log(`  - ${flag.padEnd(25)} ${value.padEnd(30)} (${param.description ?? ''})`);
    }
    console.log('');
  }

  // Handle Missing Mandatory Parameters
  if (missingMandatory.length > 0) {
    if (isInteractive) {
      console.log('Some mandatory parameters are missing. Please provide them:\n');
      for (const param of missingMandatory) {
        const flag = Core.GOConfigKeyTransformer.toCLIFlag(param.name);
        const value = await promptForParam(param, prompt);

        if (value === undefined || value === '') {
          logger.error(`Mandatory parameter ${flag} is still missing. Execution aborted.`);
          return { valid: false, finalArgs };
        }

        // Add to final args
        if (param.type === Core.GOConfigParameterType.BOOL) {
          if (value === true) {
            finalArgs.push(flag);
          }
        } else if (Array.isArray(value)) {
          finalArgs.push(flag, value.join(','));
        } else {
          finalArgs.push(flag, value.toString());
        }
      }
      return { valid: true, finalArgs };
    } else {
      logger.error('Missing mandatory parameters. Execution aborted.');
      return { valid: false, finalArgs };
    }
  }

  return { valid: true, finalArgs };
}

/**
 * Check if a parameter is provided in the parsed arguments
 */
function isParamProvided(param: Core.GOConfigParameterOptions, parsed: Map<string, string | string[]>): boolean {
  // GOCLIArgumentParser returns flags as they are in the command line (without dashes)
  const cliFlag = Core.GOConfigKeyTransformer.toCLIFlag(param.name).replace(/^--/, '');

  if (parsed.has(cliFlag)) return true;

  // Check aliases
  if (param.aliases) {
    for (const alias of param.aliases) {
      const aliasKey = alias.replace(/^-+/, '');
      if (parsed.has(aliasKey)) return true;
    }
  }

  return false;
}

/**
 * Get parameter value from parsed arguments
 */
function getParamValue(
  param: Core.GOConfigParameterOptions,
  parsed: Map<string, string | string[]>,
): string | string[] {
  const cliFlag = Core.GOConfigKeyTransformer.toCLIFlag(param.name).replace(/^--/, '');

  const val = parsed.get(cliFlag);
  if (val !== undefined) return val;

  if (param.aliases) {
    for (const alias of param.aliases) {
      const aliasKey = alias.replace(/^-+/, '');
      const aliasVal = parsed.get(aliasKey);
      if (aliasVal !== undefined) return aliasVal;
    }
  }

  return '';
}

/**
 * Format value for display
 */
function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

/**
 * Prompt for a parameter value based on its type with live validation
 */
async function promptForParam(
  param: Core.GOConfigParameterOptions,
  prompt: Core.GOPrompt,
): Promise<string | number | boolean | string[] | undefined> {
  const flag = Core.GOConfigKeyTransformer.toCLIFlag(param.name);
  const message = `Enter value for ${flag} (${param.description ?? ''})`;

  switch (param.type) {
    case Core.GOConfigParameterType.BOOL:
      return await prompt.confirm(message, param.defaultValue as boolean);

    case Core.GOConfigParameterType.INT:
    case Core.GOConfigParameterType.DOUBLE: {
      const initial = typeof param.defaultValue === 'number' ? param.defaultValue : undefined;
      const options: Core.GOPromptNumberOptions = {
        validate: (val: number) => {
          if (param.validator) {
            return param.validator(val);
          }
          return true;
        },
      };
      if (initial !== undefined) options.initial = initial;
      return await prompt.number(message, options);
    }

    case Core.GOConfigParameterType.STRING_ARRAY:
    case Core.GOConfigParameterType.INT_ARRAY:
    case Core.GOConfigParameterType.DOUBLE_ARRAY: {
      const initial = Array.isArray(param.defaultValue) ? (param.defaultValue as string[]).join(',') : undefined;
      const options: Core.GOPromptTextOptions = {
        validate: (val: string) => {
          if (param.validator) {
            const parts = val.split(',').map((s) => s.trim());
            return param.validator(parts);
          }
          return true;
        },
      };
      if (initial !== undefined) options.initial = initial;
      const resp = await prompt.text(`${message} (comma-separated)`, options);
      return resp ? resp.split(',').map((s) => s.trim()) : undefined;
    }

    default: {
      const initial = typeof param.defaultValue === 'string' ? param.defaultValue : undefined;
      const options: Core.GOPromptTextOptions = {
        validate: (val: string) => {
          if (param.validator) {
            return param.validator(val);
          }
          return true;
        },
      };
      if (initial !== undefined) options.initial = initial;
      return await prompt.text(message, options);
    }
  }
}
