import * as path from 'node:path';

import { asRecord, optionalString, rejectUnknownKeys, requiredString, stringList } from '../config/configGuards.js';
import type { DispatchSender } from '../model/DispatchSender.js';
import { isCanonicalField } from '../mapping/canonicalFields.js';
import type { CanonicalField } from '../mapping/CanonicalField.js';
import { SHA256_BASE64 } from '../mapping/fieldPatterns.js';
import type { EnvironmentDefinition } from './EnvironmentDefinition.js';
import type { EnvironmentsFile } from './EnvironmentsFile.js';
import type { ParsedEnvironmentDefaults } from './ParsedEnvironmentDefaults.js';
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
const HTTP_SCHEME = /^https?:\/\//i;
const TRAILING_SLASHES = /\/+$/;
/** Same limits as a per-row `documents.reference` (see `recordReaders`). */
const MAX_REFERENCE_KEY_LENGTH = 512;
const MAX_VERSION_TOKEN_LENGTH = 256;

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
    basePath: normalizeBasePath(requiredString(env['basePath'], `${where}.basePath`), `${where}.basePath`),
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
 * @param where - Name of the setting, for the error message (default `basePath`)
 * @returns URL with scheme
 * @throws Error when the result is not a valid URL
 */
export function normalizeBasePath(basePath: string, where: string = 'basePath'): string {
  const trimmed = basePath.trim();
  const withScheme = HTTP_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  const normalized = withScheme.replace(TRAILING_SLASHES, '');
  if (!URL.canParse(normalized)) {
    throw new Error(`${where}: "${basePath}" is not a valid host or URL (e.g. api.uat.notifichedigitali.it)`);
  }
  return normalized;
}

function parseSender(value: unknown, where: string): DispatchSender {
  const sender = asRecord(value, where);
  rejectUnknownKeys(sender, new Set(['taxId', 'denomination']), where);
  return {
    taxId: codeString(sender['taxId'], `${where}.taxId`),
    denomination: requiredString(sender['denomination'], `${where}.denomination`),
  };
}

function parseDefaults(value: unknown, where: string, baseDir: string): ParsedEnvironmentDefaults {
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
    const files = stringList(block['files'], `${where}.files`);
    if (files.length === 0) throw new Error(`${where}.files: must be a non-empty list of paths`);
    return { files: files.map((file) => path.resolve(baseDir, file)), ...(title !== undefined && { title }) };
  }

  const referenceWhere = `${where}.reference`;
  const reference = asRecord(block['reference'], referenceWhere);
  rejectUnknownKeys(reference, new Set(['key', 'versionToken', 'sha256', 'title']), referenceWhere);
  const referenceTitle = optionalString(reference['title'], `${referenceWhere}.title`) ?? title;
  return {
    reference: {
      key: maxLength(
        requiredString(reference['key'], `${referenceWhere}.key`),
        MAX_REFERENCE_KEY_LENGTH,
        `${referenceWhere}.key`,
      ),
      versionToken: maxLength(
        codeString(reference['versionToken'], `${referenceWhere}.versionToken`),
        MAX_VERSION_TOKEN_LENGTH,
        `${referenceWhere}.versionToken`,
      ),
      sha256: sha256String(reference['sha256'], `${referenceWhere}.sha256`),
      ...(referenceTitle !== undefined && { title: referenceTitle }),
    },
    ...(title !== undefined && { title }),
  };
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

/** A Base64 SHA-256 digest (44 characters), as SafeStorage expects it. */
function sha256String(value: unknown, where: string): string {
  const digest = requiredString(value, where);
  if (!SHA256_BASE64.test(digest)) throw new Error(`${where}: must be a Base64 SHA-256 of 44 characters`);
  return digest;
}

function maxLength(value: string, limit: number, where: string): string {
  if (value.length > limit) throw new Error(`${where}: exceeds ${limit} characters (${value.length})`);
  return value;
}
