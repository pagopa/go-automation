import * as path from 'node:path';

import type { DispatchSender } from '../model/DispatchSender.js';
import { isCanonicalField } from '../mapping/canonicalFields.js';
import type { CanonicalField } from '../mapping/CanonicalField.js';
import type { EnvironmentDefinition } from './EnvironmentDefinition.js';
import type { EnvironmentsFile } from './EnvironmentsFile.js';
import type { SharedDocumentConfig } from './SharedDocumentConfig.js';

const ENVIRONMENT_KEYS: ReadonlySet<string> = new Set([
  'description',
  'basePath',
  'apiKey',
  'groupId',
  'awsProfile',
  'production',
  'sender',
  'defaults',
]);
const SHARED_DOCUMENT_FIELD = 'documents.shared';
const VARIABLE_REFERENCE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
/** Fields holding codes whose leading zeros YAML would drop if unquoted. */
const CODE_FIELDS = /(taxId|zip|noticeCode|creditorTaxId)$/;

/**
 * Validates an untrusted value (a parsed YAML/JSON file) as an environments
 * file (§7.4.1).
 *
 * Unknown keys are errors (they are usually typos). `apiKey` must be a
 * `${VARIABLE}` reference: a literal key is rejected, because the file may
 * end up in synced folders or attached to a ticket. Relative paths of shared
 * document files are resolved against the file's directory.
 *
 * @param value - Parsed file content
 * @param source - Path of the file (for messages and relative paths)
 * @returns The validated environments
 * @throws Error naming the offending key; never includes secret values
 */
export function parseEnvironmentsFile(value: unknown, source: string): EnvironmentsFile {
  const root = asRecord(value, source);
  rejectUnknownKeys(root, new Set(['environments']), source);
  const environments = asRecord(root['environments'], `${source}: environments`);
  const baseDir = path.dirname(source);

  const parsed = new Map<string, EnvironmentDefinition>();
  for (const [name, definition] of Object.entries(environments)) {
    parsed.set(name, parseEnvironment(name, definition, `${source}: environments.${name}`, baseDir));
  }
  if (parsed.size === 0) throw new Error(`${source}: no environment defined`);
  return { source, environments: parsed };
}

function parseEnvironment(name: string, value: unknown, where: string, baseDir: string): EnvironmentDefinition {
  const env = asRecord(value, where);
  rejectUnknownKeys(env, ENVIRONMENT_KEYS, where);

  const apiKey = requiredString(env['apiKey'], `${where}.apiKey`);
  const variable = VARIABLE_REFERENCE.exec(apiKey)?.[1];
  if (variable === undefined) {
    throw new Error(`${where}.apiKey: must be a reference like \${PN_API_KEY_NAME}; literal API keys are not accepted`);
  }

  const production = env['production'] ?? false;
  if (typeof production !== 'boolean') throw new Error(`${where}.production: must be true or false`);

  const description = optionalString(env['description'], `${where}.description`);
  const groupId = optionalString(env['groupId'], `${where}.groupId`);
  const awsProfile = optionalString(env['awsProfile'], `${where}.awsProfile`);
  const sender = env['sender'] === undefined ? undefined : parseSender(env['sender'], `${where}.sender`);
  const { defaults, sharedDocument } = parseDefaults(env['defaults'], `${where}.defaults`, baseDir);

  return {
    name,
    basePath: normalizeBasePath(requiredString(env['basePath'], `${where}.basePath`)),
    apiKeyVariable: variable,
    production,
    defaults,
    ...(description !== undefined && { description }),
    ...(groupId !== undefined && { groupId }),
    ...(awsProfile !== undefined && { awsProfile }),
    ...(sender !== undefined && { sender }),
    ...(sharedDocument !== undefined && { sharedDocument }),
  };
}

/**
 * Normalizes a base path: adds `https://` when no scheme is given and drops
 * a trailing slash.
 *
 * @param basePath - Host or URL
 * @returns URL with scheme
 */
export function normalizeBasePath(basePath: string): string {
  const withScheme = /^https?:\/\//i.test(basePath) ? basePath : `https://${basePath}`;
  return withScheme.replace(/\/+$/, '');
}

function parseSender(value: unknown, where: string): DispatchSender {
  const sender = asRecord(value, where);
  rejectUnknownKeys(sender, new Set(['taxId', 'denomination']), where);
  return {
    taxId: codeString(sender['taxId'], `${where}.taxId`),
    denomination: requiredString(sender['denomination'], `${where}.denomination`),
  };
}

function parseDefaults(
  value: unknown,
  where: string,
  baseDir: string,
): { readonly defaults: ReadonlyMap<CanonicalField, string>; readonly sharedDocument?: SharedDocumentConfig } {
  const defaults = new Map<CanonicalField, string>();
  if (value === undefined) return { defaults };
  let sharedDocument: SharedDocumentConfig | undefined;
  for (const [field, raw] of Object.entries(asRecord(value, where))) {
    if (field === SHARED_DOCUMENT_FIELD) {
      sharedDocument = parseSharedDocument(raw, `${where}.${field}`, baseDir);
    } else if (isCanonicalField(field)) {
      const fieldWhere = `${where}.${field}`;
      defaults.set(field, CODE_FIELDS.test(field) ? codeString(raw, fieldWhere) : scalarString(raw, fieldWhere));
    } else {
      throw new Error(`${where}: unknown field "${field}"`);
    }
  }
  return sharedDocument === undefined ? { defaults } : { defaults, sharedDocument };
}

/**
 * Validates a shared document block (environment or CLI).
 *
 * @param value - Parsed block
 * @param where - Location for messages
 * @param baseDir - Base of relative file paths
 * @returns The shared document configuration
 */
export function parseSharedDocument(value: unknown, where: string, baseDir: string): SharedDocumentConfig {
  const block = asRecord(value, where);
  rejectUnknownKeys(block, new Set(['files', 'reference', 'title']), where);
  const title = optionalString(block['title'], `${where}.title`);
  const hasFiles = block['files'] !== undefined;
  const hasReference = block['reference'] !== undefined;
  if (hasFiles === hasReference) throw new Error(`${where}: set exactly one of "files" and "reference"`);

  if (hasFiles) {
    const files = block['files'];
    if (!Array.isArray(files) || files.length === 0 || !files.every((f): f is string => typeof f === 'string')) {
      throw new Error(`${where}.files: must be a non-empty list of paths`);
    }
    return { files: files.map((file) => path.resolve(baseDir, file)), ...(title !== undefined && { title }) };
  }

  const reference = asRecord(block['reference'], `${where}.reference`);
  rejectUnknownKeys(reference, new Set(['key', 'versionToken', 'sha256', 'title']), `${where}.reference`);
  const referenceTitle = optionalString(reference['title'], `${where}.reference.title`) ?? title;
  return {
    reference: {
      key: requiredString(reference['key'], `${where}.reference.key`),
      versionToken: scalarString(reference['versionToken'], `${where}.reference.versionToken`),
      sha256: requiredString(reference['sha256'], `${where}.reference.sha256`),
      ...(referenceTitle !== undefined && { title: referenceTitle }),
    },
    ...(title !== undefined && { title }),
  };
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${where}: must be an object`);
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, where: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${where}: unknown key "${key}"`);
  }
}

function requiredString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${where}: must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown, where: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, where);
}

/** Accepts strings, numbers and booleans (YAML turns `100` or `true` into non-strings). */
function scalarString(value: unknown, where: string): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return requiredString(value, where);
}

/**
 * Codes (tax ids, ZIP codes, notice codes) must be strings: unquoted in YAML,
 * `00000000001` becomes the number 1 and the leading zeros are lost.
 */
function codeString(value: unknown, where: string): string {
  if (typeof value === 'number') {
    throw new Error(
      `${where}: write the value in quotes (YAML reads it as the number ${value} and drops leading zeros)`,
    );
  }
  return requiredString(value, where);
}
