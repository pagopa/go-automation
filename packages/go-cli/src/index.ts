#!/usr/bin/env node

/**
 * GO Automation CLI - Main Entry Point
 *
 * Unified interface for discovering, inspecting, and running scripts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { Core } from '@go-automation/go-common';
import { discoverScripts, loadScriptParameters, getDiscoveryErrors, type DiscoveredScript } from './discovery.js';
import { runScript, type ExecutionMode } from './runner.js';
import { validateAndInformParameters } from './params.js';
import { HistoryManager } from './history.js';
import { Scaffolder } from './scaffold.js';
import { PresetManager } from './presets.js';
import { PreFlightChecker } from './checker.js';

// Setup dependencies
const logger = new Core.GOLogger([new Core.GOConsoleLoggerHandler()]);
const prompt = new Core.GOPrompt(logger);
const history = new HistoryManager();
const scaffolder = new Scaffolder(prompt, logger);
const presets = new PresetManager();
const checker = new PreFlightChecker(logger);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--refresh')) {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const dirName = path.dirname(fileURLToPath(import.meta.url));
      const cacheFile = path.join(dirName, '../.discovery-cache.json');
      await fs.unlink(cacheFile);
      console.log('Discovery cache refreshed.');
    } catch (_e) {
      console.log('No cache to refresh.');
    }
    process.exit(0);
  }

  const scripts = await discoverScripts();

  const program = new Command();

  program
    .name('go-cli')
    .description('GO Automation Centralized Control Plane')
    .version('1.0.0')
    .option('-s, --source', 'Run from TypeScript source (via tsx)', true)
    .option('-d, --dist', 'Run from compiled JavaScript (via node)')
    .option('--dry-run', 'Execute script in dry-run mode (simulated)', false)
    .option('--save <name>', 'Save current arguments as a named preset')
    .option('--preset <name>', 'Load arguments from a named preset')
    .option('--refresh', 'Force refresh the script discovery cache', false);

  // 1. Dynamic Command Registration
  for (const script of scripts) {
    const scriptCmd = program
      .command(script.id)
      .description(script.metadata.description ?? `Run ${script.id} script`)
      .allowUnknownOption() // Allow script-specific parameters
      .action(async (_options: Record<string, unknown>, cmd: Command) => {
        const programOpts = program.opts();
        const mode: ExecutionMode = programOpts['dist'] ? 'dist' : 'source';
        const isDryRun = !!programOpts['dryRun'];
        const presetName = programOpts['preset'] as string | undefined;
        const saveName = programOpts['save'] as string | undefined;

        // Pre-flight checks
        const isReady = await checker.verify(script, mode);
        if (!isReady) {
          process.exit(1);
        }

        let currentArgs = cmd.args;

        // Load preset if requested
        if (presetName) {
          const presetArgs = await presets.getPreset(script.id, presetName);
          if (presetArgs) {
            logger.info(`Loading preset '${presetName}': ${presetArgs.join(' ')}`);
            currentArgs = presetArgs;
          } else {
            logger.warning(`Preset '${presetName}' not found for script ${script.id}.`);
          }
        }

        // Add to history
        await history.add(script.id);

        // Lazy load parameters
        await loadScriptParameters(script);

        // Validate and inform about parameters before execution
        const { valid, finalArgs } = await validateAndInformParameters(script, currentArgs, prompt, logger, false);

        if (!valid) {
          process.exit(1);
        }

        // Save preset if requested
        if (saveName) {
          await presets.savePreset(script.id, saveName, finalArgs);
          logger.success(`Arguments saved as preset '${saveName}'.`);
        }

        if (isDryRun) {
          logger.newline();
          logger.header('DRY RUN ACTIVE - NO REAL CHANGES WILL BE MADE');
        }

        const exitCode = await runScript(script, {
          mode,
          args: finalArgs,
          isDryRun,
        });
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

      // Show Presets
      const scriptPresets = await presets.listPresets(script.id);
      if (scriptPresets.length > 0) {
        console.log('\nAvailable Presets:');
        scriptPresets.forEach((p) => console.log(`  - ${p}`));
      }

      process.exit(0);
    });

  // 4. New Command (Scaffolding)
  program
    .command('new')
    .description('Create a new GO Automation script from templates')
    .action(async () => {
      await scaffolder.run();
      process.exit(0);
    });

  // 5. Doctor Command (Diagnostics)
  program
    .command('doctor')
    .description('Check monorepo for scripts that failed discovery')
    .action(() => {
      const errors = getDiscoveryErrors();
      logger.newline();
      logger.header('GO Automation Doctor');

      if (errors.length === 0) {
        logger.success('All scripts discovered successfully! Your monorepo is healthy.');
      } else {
        logger.error(`Found ${errors.length} script(s) with discovery errors:`);
        errors.forEach((err) => {
          console.log(`\nScript: [${err.category}] ${err.id}`);
          console.log(`Path:   ${err.configPath}`);
          console.log(`Error:  ${err.error}`);
        });
        logger.newline();
        logger.info('Check the syntax and exports in the config.ts files above.');
      }
      process.exit(errors.length > 0 ? 1 : 0);
    });

  // 6. Interactive Fallback
  if (process.argv.length <= 2) {
    await runInteractive(scripts);
    return;
  }

  program.parse(process.argv);
}

type Step =
  | 'CATEGORY'
  | 'SCRIPT'
  | 'MODE'
  | 'DRY_RUN'
  | 'PRESET_CHOICE'
  | 'PRESET_SELECT'
  | 'ARGS'
  | 'SAVE_PRESET_CHOICE'
  | 'SAVE_PRESET_NAME'
  | 'EXECUTION';

interface NavigationState {
  category?: string;
  script?: DiscoveredScript;
  mode?: ExecutionMode;
  isDryRun?: boolean;
  usePreset?: boolean;
  selectedPreset?: string;
  args?: string[];
  finalArgs?: string[];
  wantSavePreset?: boolean;
  presetName?: string;
}

/**
 * Interactive Mode - Categorized menu for script selection
 */
async function runInteractive(scripts: DiscoveredScript[]): Promise<void> {
  console.clear();
  console.log('╭─────────────────────────────────────────╮');
  console.log('│  GO Automation CLI                      │');
  console.log('│  Gestione Operativa Control Plane       │');
  console.log('╰─────────────────────────────────────────╯');

  logger.newline();

  const productMap: Record<string, string> = {
    go: '[GO] Team Gestione Operativa',
    send: '[SEND] SErvizio Notifiche Digitali',
    interop: '[INTEROP] PDND Interoperabilità',
  };

  const categories = [...new Set(scripts.map((s) => s.category))].sort();

  const state: NavigationState = {};
  const historyStack: Step[] = ['CATEGORY'];

  while (historyStack.length > 0) {
    const currentStep = historyStack[historyStack.length - 1];

    switch (currentStep) {
      case 'CATEGORY': {
        const categoryChoice = await prompt.select<string>('Select product/team category:', [
          ...categories.map((c) => ({
            title: productMap[c] ?? c.toUpperCase(),
            value: c,
          })),
        ]);

        if (categoryChoice === undefined) {
          historyStack.pop();
          continue;
        }

        state.category = categoryChoice;
        historyStack.push('SCRIPT');
        break;
      }

      case 'SCRIPT': {
        const selectedCategory = state.category;
        if (!selectedCategory) {
          historyStack.pop();
          continue;
        }
        const categoryScripts = scripts.filter((s) => s.category === selectedCategory);
        const recentIds = await history.getHistory();

        const choices = categoryScripts.map((s) => {
          const isRecent = recentIds.includes(s.id);
          const suffix = isRecent ? ' (recent)' : '';
          return {
            title: `${s.id}${suffix}`,
            value: s.id,
            description: s.metadata.description,
            isRecent,
            historyIndex: recentIds.indexOf(s.id),
          };
        });

        choices.sort((a, b) => {
          if (a.isRecent && b.isRecent) return a.historyIndex - b.historyIndex;
          if (a.isRecent) return -1;
          if (b.isRecent) return 1;
          return a.title.localeCompare(b.title);
        });

        const selectedScriptId = await prompt.select<string>(
          `Select a ${productMap[selectedCategory] ?? selectedCategory.toUpperCase()} script to run:`,
          choices.map((c) => ({
            title: c.title,
            value: c.value,
            description: c.description,
          })),
        );

        if (selectedScriptId === undefined) {
          historyStack.pop();
          continue;
        }

        const selectedScript = scripts.find((s) => s.id === selectedScriptId);

        if (!selectedScript) {
          // Should not happen with autocomplete
          continue;
        }

        state.script = selectedScript;
        historyStack.push('MODE');
        break;
      }

      case 'MODE': {
        const modeChoice = await prompt.select<ExecutionMode>('Select execution mode:', [
          { title: 'Source (tsx) - Best for development', value: 'source' },
          { title: 'Dist (node) - Best for validation', value: 'dist' },
        ]);

        if (modeChoice === undefined) {
          historyStack.pop();
          continue;
        }

        state.mode = modeChoice;

        if (!state.script) {
          historyStack.pop();
          continue;
        }

        // Pre-flight checks
        const isReady = await checker.verify(state.script, state.mode);
        if (!isReady) {
          // If not ready, we don't go back, we just stay here or let the user fix it
          continue;
        }

        historyStack.push('DRY_RUN');
        break;
      }

      case 'DRY_RUN': {
        if (!state.script) {
          historyStack.pop();
          continue;
        }
        const isDryRun = await prompt.confirm('Execute in dry-run mode (simulated)?', false);

        if (isDryRun === undefined) {
          historyStack.pop();
          continue;
        }

        state.isDryRun = isDryRun;

        const scriptPresets = await presets.listPresets(state.script.id);
        if (scriptPresets.length > 0) {
          historyStack.push('PRESET_CHOICE');
        } else {
          state.usePreset = false;
          historyStack.push('ARGS');
        }
        break;
      }

      case 'PRESET_CHOICE': {
        if (!state.script) {
          historyStack.pop();
          continue;
        }
        const usePreset = await prompt.confirm('Do you want to use a saved preset?', false);
        if (usePreset === undefined) {
          historyStack.pop();
          continue;
        }

        state.usePreset = usePreset;
        if (usePreset) {
          historyStack.push('PRESET_SELECT');
        } else {
          historyStack.push('ARGS');
        }
        break;
      }

      case 'PRESET_SELECT': {
        if (!state.script) {
          historyStack.pop();
          continue;
        }
        const scriptPresets = await presets.listPresets(state.script.id);
        const selectedPreset = await prompt.select<string>(
          'Select a preset:',
          scriptPresets.map((p) => ({ title: p, value: p })),
        );

        if (selectedPreset === undefined) {
          historyStack.pop();
          continue;
        }

        state.selectedPreset = selectedPreset;
        state.args = (await presets.getPreset(state.script.id, selectedPreset)) ?? [];

        const { valid, back, finalArgs } = await validateAndInformParameters(
          state.script,
          state.args,
          prompt,
          logger,
          true,
        );

        if (back || !valid) {
          continue;
        }

        state.finalArgs = finalArgs;
        historyStack.push('EXECUTION');
        break;
      }

      case 'ARGS': {
        if (!state.script) {
          historyStack.pop();
          continue;
        }
        // Lazy load parameters if not already loaded
        const parameters = await loadScriptParameters(state.script);

        const mandatoryFlags = parameters
          .filter((p) => p.required)
          .map((p) => Core.GOConfigKeyTransformer.toCLIFlag(p.name))
          .join(', ');

        const promptMsg = mandatoryFlags
          ? `Enter arguments (Mandatory: ${mandatoryFlags}):`
          : 'Enter additional arguments (optional, e.g. --param value):';

        const argsInput = await prompt.text(promptMsg);

        if (argsInput === undefined) {
          historyStack.pop();
          continue;
        }

        state.args = argsInput.trim() !== '' ? argsInput.trim().split(/\s+/) : [];

        const { valid, back, finalArgs } = await validateAndInformParameters(
          state.script,
          state.args,
          prompt,
          logger,
          true,
        );

        if (back || !valid) {
          continue;
        }

        state.finalArgs = finalArgs;

        if (state.args.length > 0) {
          historyStack.push('SAVE_PRESET_CHOICE');
        } else {
          historyStack.push('EXECUTION');
        }
        break;
      }

      case 'SAVE_PRESET_CHOICE': {
        const wantSave = await prompt.confirm('Do you want to save these arguments as a preset?', false);

        if (wantSave === undefined) {
          historyStack.pop();
          continue;
        }

        if (wantSave) {
          historyStack.push('SAVE_PRESET_NAME');
        } else {
          historyStack.push('EXECUTION');
        }
        break;
      }

      case 'SAVE_PRESET_NAME': {
        if (!state.script || !state.finalArgs) {
          historyStack.pop();
          continue;
        }
        const name = await prompt.text('Preset Name:');

        if (name === undefined) {
          historyStack.pop();
          continue;
        }

        if (name) {
          await presets.savePreset(state.script.id, name, state.finalArgs);
          logger.success(`Preset '${name}' saved.`);
        }
        historyStack.push('EXECUTION');
        break;
      }

      case 'EXECUTION': {
        if (!state.script || !state.mode || !state.finalArgs) {
          historyStack.pop();
          break;
        }
        // Add to history just before execution
        await history.add(state.script.id);

        if (state.isDryRun) {
          logger.newline();
          logger.header('DRY RUN ACTIVE - NO REAL CHANGES WILL BE MADE');
        }

        const exitCode = await runScript(state.script, {
          mode: state.mode,
          args: state.finalArgs,
          isDryRun: state.isDryRun ?? false,
        });
        return process.exit(exitCode);
      }

      default:
        historyStack.pop();
        break;
    }
  }

  // If loop finishes (stack empty), just exit
  process.exit(0);
}

main().catch((err: Error) => {
  logger.error(`CLI Error: ${err.message}`);
  process.exit(1);
});
