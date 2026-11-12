/**
 * Identity of a run and the check that a resume repeats it (§11.3).
 *
 * The idempotency keys of a row derive from the run id and the row key (and,
 * in `direct`, from the requestId template); the notification content
 * derives from mapping profile, field values and documents. A resume with
 * different settings would send rows with other keys or other content, i.e.
 * duplicate notifications or paper mail: the resume is refused instead.
 */

import type { Dispatch } from '@go-automation/go-send';

import type { DispatchPhaseName } from '../types/DispatchPhaseName.js';
import type { IdentityScope } from '../types/IdentityScope.js';
import type { RunIdentity } from '../types/RunIdentity.js';
import type { RunIdentityKey } from '../types/RunIdentityKey.js';
import { DispatchUsageError } from './DispatchUsageError.js';

/** Key of `run.json` `parameters` holding the identity. */
export const RUN_IDENTITY_PARAMETER = 'identity';

/** Every identity key with the phases that make it relevant, in display order. */
const IDENTITY_SCOPES: ReadonlyMap<RunIdentityKey, IdentityScope> = new Map<RunIdentityKey, IdentityScope>([
  ['mode', 'always'],
  ['inputFormat', 'always'],
  ['mappingProfile', 'always'],
  ['mappingProfileSha256', 'always'],
  ['rowKeyColumn', 'always'],
  ['directRequestIdTemplate', 'always'],
  ['env', 'b2b'],
  ['endpoint', 'b2b'],
  ['cliValues', 'send'],
  ['environmentValues', 'send'],
  ['sharedDocument', 'send'],
  ['documentsDir', 'send'],
  ['attachmentsFile', 'send'],
]);

/**
 * Renders field values as `field=value` pairs sorted by field, `; `-separated.
 *
 * @param values - Field values
 * @returns Stable text, empty when there are no values
 */
export function formatFieldValues(values: Dispatch.FieldValues): string {
  return [...values.entries()]
    .map(([field, value]) => `${field}=${value}`)
    .sort((a, b) => a.localeCompare(b))
    .join('; ');
}

/**
 * Renders the shared document of a run: its files (`|`-separated) or its
 * SafeStorage key, plus the title.
 *
 * @param document - Shared document, if any
 * @returns Stable text, empty without a shared document
 */
export function formatSharedDocument(document: Dispatch.SharedDocumentConfig | undefined): string {
  if (document === undefined) return '';
  const source =
    document.reference === undefined
      ? `files=${(document.files ?? []).join('|')}`
      : `reference=${document.reference.key}`;
  return document.title === undefined ? source : `${source}; title=${document.title}`;
}

/**
 * Settings of the previous run saved in `run.json`, or `undefined` when the
 * run predates the identity check (or the file was edited by hand).
 *
 * @param parameters - `parameters` of the previous `run.json`
 * @returns The saved identity
 */
function savedRunIdentity(parameters: Readonly<Record<string, unknown>>): RunIdentity | undefined {
  const saved: unknown = parameters[RUN_IDENTITY_PARAMETER];
  if (typeof saved !== 'object' || saved === null) return undefined;
  const entries = new Map<string, unknown>(Object.entries(saved));
  const identity: Partial<Record<RunIdentityKey, string>> = {};
  for (const key of IDENTITY_SCOPES.keys()) {
    const value = entries.get(key);
    if (typeof value !== 'string') return undefined;
    identity[key] = value;
  }
  return identity as RunIdentity; // Safe: every key was checked above
}

/**
 * Refuses a resume whose settings differ from those of the run it resumes,
 * for the settings that matter with the phases of this session (phases,
 * retries, throughput, timeouts and output options may change).
 *
 * @param previous - `run.json` of the session being resumed
 * @param previousPath - Its path, for the message
 * @param current - Identity of this session
 * @param phases - Phases of this session
 * @throws DispatchUsageError listing the differing settings, or when the
 *   previous run has no saved identity
 */
export function assertSameRunIdentity(
  previous: Dispatch.RunInfo,
  previousPath: string,
  current: RunIdentity,
  phases: ReadonlyArray<DispatchPhaseName>,
): void {
  const saved = savedRunIdentity(previous.parameters);
  if (saved === undefined) {
    throw new DispatchUsageError(
      `--resume: ${previousPath} was written by a version of the script that does not record the settings ` +
        'that identify the rows (mode, mapping profile, row key, environment, defaults, documents). ' +
        'The resume is refused because it could send duplicates: start a new run on the rows still to send.',
    );
  }
  const sends = phases.includes('send');
  const callsB2B = sends || phases.includes('verify');
  const differences: string[] = [];
  for (const [key, scope] of IDENTITY_SCOPES) {
    const relevant = scope === 'always' || (scope === 'send' ? sends : callsB2B);
    if (relevant && saved[key] !== current[key]) {
      differences.push(`  - ${key}: "${saved[key]}" → "${current[key]}"`);
    }
  }
  if (differences.length === 0) return;
  const rule =
    'Repeat the original parameters: only --phases, retries, throughput, timeouts and output options may change.';
  throw new DispatchUsageError(
    `--resume: settings differ from the run being resumed (${previousPath}). ${rule}\n${differences.join('\n')}`,
  );
}
