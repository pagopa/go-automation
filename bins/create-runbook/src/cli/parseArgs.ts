import { parseArgs } from 'node:util';

import { RUNBOOK_TEMPLATES } from '../templates/runbookTemplates.js';

/** Parsed command-line arguments for the scaffolder. */
export interface CliArgs {
  readonly type?: string;
  readonly id?: string;
  readonly description?: string;
  readonly version?: string;
  readonly team?: string;
  readonly tags?: string;
  readonly product?: string;
  readonly categories?: string;
  /** Template-specific flag values, keyed by input name. */
  readonly extras: ReadonlyMap<string, string>;
  /** Whether to wire the runbook into the automatic catalog (default true). */
  readonly wire: boolean;
  /** Preview only: render and print without writing or wiring. */
  readonly dryRun: boolean;
  /** Skip the confirmation prompt. */
  readonly yes: boolean;
}

interface MutableCliArgs {
  type?: string;
  id?: string;
  description?: string;
  version?: string;
  team?: string;
  tags?: string;
  product?: string;
  categories?: string;
  extras: ReadonlyMap<string, string>;
  wire: boolean;
  dryRun: boolean;
  yes: boolean;
}

type FlagValue = string | boolean | undefined;

function collectTemplateInputNames(): ReadonlyArray<string> {
  const names = new Set<string>();
  for (const template of RUNBOOK_TEMPLATES) {
    for (const templateInput of template.inputs) {
      names.add(templateInput.name);
    }
  }
  return [...names];
}

function asString(value: FlagValue): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Parses scaffolder CLI arguments. Common flags are typed explicitly;
 * template-specific flags (declared by each template's inputs) are
 * collected into {@link CliArgs.extras}. Unknown flags throw.
 *
 * @param argv - Arguments after the node binary and script (process.argv.slice(2))
 * @returns The parsed arguments
 */
export function parseCliArgs(argv: ReadonlyArray<string>): CliArgs {
  const templateInputNames = collectTemplateInputNames();

  const options: Record<string, { type: 'string' | 'boolean' }> = {
    type: { type: 'string' },
    id: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string' },
    team: { type: 'string' },
    tags: { type: 'string' },
    product: { type: 'string' },
    categories: { type: 'string' },
    'no-wire': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    yes: { type: 'boolean' },
  };
  for (const name of templateInputNames) {
    options[name] = { type: 'string' };
  }

  const { values } = parseArgs({ args: [...argv], options, allowPositionals: false });

  const extras = new Map<string, string>();
  for (const name of templateInputNames) {
    const value = asString(values[name]);
    if (value !== undefined) {
      extras.set(name, value);
    }
  }

  const args: MutableCliArgs = {
    extras,
    wire: values['no-wire'] !== true,
    dryRun: values['dry-run'] === true,
    yes: values['yes'] === true,
  };

  const type = asString(values['type']);
  if (type !== undefined) args.type = type;
  const id = asString(values['id']);
  if (id !== undefined) args.id = id;
  const description = asString(values['description']);
  if (description !== undefined) args.description = description;
  const version = asString(values['version']);
  if (version !== undefined) args.version = version;
  const team = asString(values['team']);
  if (team !== undefined) args.team = team;
  const tags = asString(values['tags']);
  if (tags !== undefined) args.tags = tags;
  const product = asString(values['product']);
  if (product !== undefined) args.product = product;
  const categories = asString(values['categories']);
  if (categories !== undefined) args.categories = categories;

  return args;
}
