import { input, select, confirm } from '@inquirer/prompts';

import type { RunbookTemplate } from '../templates/RunbookTemplate.js';
import type { RunbookAnswers } from '../templates/RunbookAnswers.js';
import type { TemplateInput } from '../templates/TemplateInput.js';
import type { CliArgs } from './parseArgs.js';
import { RUNBOOK_TEMPLATES, findRunbookTemplate } from '../templates/runbookTemplates.js';
import { deriveBuilderName } from '../naming/deriveBuilderName.js';
import { runbookIdError } from '../validation/runbookIdError.js';

type TextValidator = (value: string) => true | string;

interface TextPromptOptions {
  readonly message: string;
  readonly default?: string;
  readonly validate?: TextValidator;
}

function parseTags(raw: string): ReadonlyArray<string> {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function defaultTags(template: RunbookTemplate): string {
  if (template.id === 'service') return 'service';
  return template.id === 'api-gateway' ? 'api-gateway' : '';
}

function validateIdInput(value: string): true | string {
  return runbookIdError(value.trim()) ?? true;
}

function requiredInput(value: string): true | string {
  return value.trim().length > 0 ? true : 'Campo obbligatorio.';
}

/**
 * Prompts for free-text input, returning the CLI value when already
 * provided. Builds the inquirer config without passing explicit
 * `undefined` (required by `exactOptionalPropertyTypes`).
 */
async function resolveText(cliValue: string | undefined, options: TextPromptOptions): Promise<string> {
  if (cliValue !== undefined) {
    return cliValue;
  }
  const { message, default: defaultValue, validate } = options;
  if (defaultValue !== undefined && validate !== undefined) {
    return input({ message, default: defaultValue, validate });
  }
  if (defaultValue !== undefined) {
    return input({ message, default: defaultValue });
  }
  if (validate !== undefined) {
    return input({ message, validate });
  }
  return input({ message });
}

async function promptSelect(templateInput: TemplateInput, defaultValue: string): Promise<string> {
  const choices = (templateInput.choices ?? []).map((choice) => ({ name: choice.label, value: choice.value }));
  const hasValidDefault = defaultValue.length > 0 && choices.some((choice) => choice.value === defaultValue);
  if (hasValidDefault) {
    return select({ message: templateInput.message, choices, default: defaultValue });
  }
  return select({ message: templateInput.message, choices });
}

async function collectExtras(
  template: RunbookTemplate,
  id: string,
  cli: CliArgs,
): Promise<ReadonlyMap<string, string>> {
  const collected = new Map<string, string>();

  for (const templateInput of template.inputs) {
    const fromCli = cli.extras.get(templateInput.name);
    if (fromCli !== undefined) {
      collected.set(templateInput.name, fromCli);
      continue;
    }

    const defaultValue = templateInput.defaultValue?.({ id, collected }) ?? '';

    const value =
      templateInput.kind === 'select'
        ? await promptSelect(templateInput, defaultValue)
        : await resolveText(undefined, {
            message: templateInput.message,
            default: defaultValue,
            ...(templateInput.required ? { validate: requiredInput } : {}),
          });

    collected.set(templateInput.name, value);
  }

  return collected;
}

/**
 * Resolves the runbook template, prompting with a selector when `--type`
 * was not supplied.
 *
 * @param typeId - Template id from the CLI, if any
 * @returns The resolved template
 */
export async function resolveTemplate(typeId: string | undefined): Promise<RunbookTemplate> {
  if (typeId !== undefined) {
    const template = findRunbookTemplate(typeId);
    if (template === undefined) {
      const available = RUNBOOK_TEMPLATES.map((entry) => entry.id).join(', ');
      throw new Error(`Tipo template sconosciuto: "${typeId}". Disponibili: ${available}.`);
    }
    return template;
  }

  const chosenId = await select({
    message: 'Tipo di runbook',
    choices: RUNBOOK_TEMPLATES.map((template) => ({
      name: `${template.label} — ${template.description}`,
      value: template.id,
    })),
  });

  const chosen = findRunbookTemplate(chosenId);
  if (chosen === undefined) {
    throw new Error(`Tipo template sconosciuto: "${chosenId}".`);
  }
  return chosen;
}

/**
 * Collects all answers needed to scaffold a runbook, prompting only for the
 * fields not already provided via CLI flags.
 *
 * @param template - The selected template
 * @param cli - Parsed CLI arguments
 * @returns The resolved answers
 */
export async function collectAnswers(template: RunbookTemplate, cli: CliArgs): Promise<RunbookAnswers> {
  const id = (await resolveText(cli.id, { message: 'Runbook id (= nome cartella)', validate: validateIdInput })).trim();

  const idError = runbookIdError(id);
  if (idError !== undefined) {
    throw new Error(idError);
  }

  const builderName = await resolveText(cli.builder, {
    message: 'Builder function name',
    default: deriveBuilderName(id),
  });
  const description = await resolveText(cli.description, { message: 'Descrizione', default: '' });
  const version = await resolveText(cli.version, { message: 'Versione', default: '1.0.0' });
  const team = await resolveText(cli.team, { message: 'Team', default: 'GO' });
  const tagsRaw = await resolveText(cli.tags, {
    message: 'Tags (separati da virgola)',
    default: defaultTags(template),
  });

  const extras = await collectExtras(template, id, cli);

  return {
    templateId: template.id,
    id,
    builderName,
    metadataName: `ANALISI ALLARME ${id}`,
    description,
    version,
    team,
    tags: parseTags(tagsRaw),
    extras,
  };
}

/**
 * Asks for confirmation before writing files.
 *
 * @returns `true` when the user confirms
 */
export async function confirmGeneration(): Promise<boolean> {
  return confirm({ message: 'Genero i file?', default: true });
}
