import { EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION } from './external.js';

const VALUE_OPTIONS: ReadonlySet<string> = new Set([
  '--environment',
  '--regions',
  '--config-dir',
  '--change-note',
  '--drain-timeout',
]);
const FLAG_OPTIONS: ReadonlySet<string> = new Set(['--dry-run', '--allow-empty-catalog']);
const DEFAULT_CHANGE_NOTE = 'No change note provided';

export interface EnvironmentDeployOptions {
  readonly environment: string;
  readonly regions: ReadonlyArray<string>;
  readonly configDir: string;
  readonly changeNote: string;
  readonly drainTimeoutMs: number;
  readonly dryRun: boolean;
  readonly allowEmptyCatalog: boolean;
}

/**
 * Parses the environment deploy CLI arguments.
 * Unknown options are rejected so a mistyped flag cannot silently fall back to a default value.
 * The change note is mandatory only for production releases.
 */
export function parseOptions(args: ReadonlyArray<string>): EnvironmentDeployOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === undefined || !name.startsWith('--')) throw new Error(`Unexpected argument: ${name ?? ''}`);
    if (FLAG_OPTIONS.has(name)) {
      flags.add(name);
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) throw new Error(`Unknown option: ${name}`);
    if (values.has(name)) throw new Error(`Duplicate option: ${name}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.set(name, value);
    index += 1;
  }
  const environment = option(values, '--environment');
  const regions = option(values, '--regions')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (new Set(regions).size !== regions.length) throw new Error('--regions contains duplicates');
  if (!regions.includes(EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION)) {
    throw new Error(`--regions must include ${EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION}`);
  }
  const changeNote = values.get('--change-note')?.trim() ?? '';
  if (environment === 'production' && changeNote === '') {
    throw new Error('--change-note is required in production');
  }
  return {
    environment,
    regions,
    configDir: option(values, '--config-dir'),
    changeNote: changeNote === '' ? DEFAULT_CHANGE_NOTE : changeNote,
    drainTimeoutMs: parseDuration(values.get('--drain-timeout') ?? '2h'),
    dryRun: flags.has('--dry-run'),
    allowEmptyCatalog: flags.has('--allow-empty-catalog'),
  };
}

function option(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name)?.trim();
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

function parseDuration(value: string): number {
  const match = /^(\d+)(s|m|h)$/u.exec(value);
  if (match === null) throw new Error('--drain-timeout must use s, m or h');
  const amount = Number(match[1]);
  const factor = match[2] === 's' ? 1_000 : match[2] === 'm' ? 60_000 : 3_600_000;
  return amount * factor;
}
