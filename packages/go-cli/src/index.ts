#!/usr/bin/env node

/**
 * GO Automation CLI - Main Entry Point
 *
 * Unified interface for discovering, inspecting, and running scripts.
 */

import { Command } from 'commander';
import { Core } from '@go-automation/go-common';
import { discoverScripts, loadScriptParameters, type DiscoveredScript } from './discovery.js';
import { runScript, type ExecutionMode } from './runner.js';
import { validateAndInformParameters } from './params.js';

// Setup Logger and Prompt using go-common
// We need to provide at least a console handler for the logger to work
const logger = new Core.GOLogger([new Core.GOConsoleLoggerHandler()]);
const prompt = new Core.GOPrompt(logger);

async function main(): Promise<void> {
  const scripts = await discoverScripts();

  const program = new Command();

  program
    .name('go-cli')
    .description('GO Automation Centralized Control Plane')
    .version('1.0.0')
    .option('-s, --source', 'Run from TypeScript source (via tsx)', true)
    .option('-d, --dist', 'Run from compiled JavaScript (via node)');

  // 1. Dynamic Command Registration
  for (const script of scripts) {
    const scriptCmd = program
      .command(script.id)
      .description(script.metadata.description ?? `Run ${script.id} script`)
      .allowUnknownOption() // Allow script-specific parameters
      .action(async (_options: Record<string, unknown>, cmd: Command) => {
        const programOpts = program.opts();
        const mode: ExecutionMode = programOpts['dist'] ? 'dist' : 'source';

        // Lazy load parameters
        await loadScriptParameters(script);

        // Validate and inform about parameters before execution
        const { valid, finalArgs } = await validateAndInformParameters(script, cmd.args, prompt, logger, false);

        if (!valid) {
          process.exit(1);
        }

        const exitCode = await runScript(script, mode, finalArgs);
        process.exit(exitCode);
      });

    // Add help for script parameters if metadata is available
    scriptCmd.on('--help', () => {
      console.log('\nScript Parameters:');

      // If they are not loaded, we inform the user to use the info command
      if (!script.parameters) {
        console.log(`  Parameters not loaded. Use "go-cli info ${script.id}" for full details.`);
      } else {
        script.parameters.forEach((param) => {
          const name = `--${param.name.replace(/\./g, '-')}`;
          const aliases = param.aliases?.map((a) => `-${a}`).join(', ') ?? '';
          const required = param.required ? '(required)' : '';
          console.log(`  ${name.padEnd(20)} ${aliases.padEnd(10)} ${required.padEnd(12)} ${param.description}`);
        });
      }
    });
  }

  // 2. Info Command
  program
    .command('info <script-name>')
    .description('Show detailed information about a script')
    .action(async (scriptName: string) => {
      const script = scripts.find((s) => s.id === scriptName);
      if (!script) {
        logger.error(`Script '${scriptName}' not found.`);
        process.exit(1);
      }

      // Lazy load parameters
      const parameters = await loadScriptParameters(script);

      console.log(`\nScript: ${script.metadata.name}`);
      console.log(`Version: ${script.metadata.version ?? 'N/A'}`);
      console.log(`Author: ${script.metadata.authors.join(', ')}`);
      console.log(`Category: ${script.category}`);
      console.log(`Description: ${script.metadata.description ?? 'N/A'}`);
      console.log(`\nPath: ${script.paths.root}`);

      console.log('\nAvailable Parameters:');
      parameters.forEach((param) => {
        const name = `--${param.name.replace(/\./g, '-')}`;
        const aliases = param.aliases?.map((a) => `-${a}`).join(', ') ?? '';
        const defaultValue = param.defaultValue !== undefined ? `(Default: ${String(param.defaultValue)})` : '';
        console.log(`  ${name.padEnd(20)} ${aliases.padEnd(10)} ${param.description} ${defaultValue}`);
      });
      process.exit(0);
    });

  // 3. Interactive Fallback
  if (process.argv.length <= 2) {
    await runInteractive(scripts);
    return;
  }

  program.parse(process.argv);
}

/**
 * Interactive Mode - Searchable menu for script selection
 */
async function runInteractive(scripts: DiscoveredScript[]): Promise<void> {
  console.clear();
  console.log('╭─────────────────────────────────────────╮');
  console.log('│  GO Automation CLI                      │');
  console.log('│  Gestione Operativa Control Plane       │');
  console.log('╰─────────────────────────────────────────╯\n');

  const choices = scripts.map((s) => ({
    title: `[${s.category}] ${s.id}`,
    value: s.id,
    description: s.metadata.description,
  }));

  const selectedTitle = await prompt.autocomplete(
    'Select a script to run:',
    choices.map((c) => c.title),
  );

  if (!selectedTitle) {
    process.exit(0);
  }

  // Find script by the title match
  const selectedScript = scripts.find((s) => `[${s.category}] ${s.id}` === selectedTitle);

  if (selectedScript) {
    const modeChoice = await prompt.select('Select execution mode:', [
      { title: 'Source (tsx) - Best for development', value: 'source' },
      { title: 'Dist (node) - Best for validation', value: 'dist' },
    ]);

    if (!modeChoice) process.exit(0);

    // Lazy load parameters
    const parameters = await loadScriptParameters(selectedScript);

    const mandatoryFlags = parameters
      .filter((p) => p.required)
      .map((p) => Core.GOConfigKeyTransformer.toCLIFlag(p.name))
      .join(', ');

    const promptMsg = mandatoryFlags
      ? `Enter arguments (Mandatory: ${mandatoryFlags}):`
      : 'Enter additional arguments (optional, e.g. --param value):';

    const argsInput = await prompt.text(promptMsg);
    const initialArgs = argsInput && argsInput.trim() !== '' ? argsInput.trim().split(/\s+/) : [];

    // Validate and inform about parameters before execution (Interactive)
    const { valid, finalArgs } = await validateAndInformParameters(selectedScript, initialArgs, prompt, logger, true);

    if (!valid) {
      process.exit(1);
    }

    const exitCode = await runScript(selectedScript, modeChoice as ExecutionMode, finalArgs);
    process.exit(exitCode);
  }
}

main().catch((err: Error) => {
  logger.error(`CLI Error: ${err.message}`);
  process.exit(1);
});
