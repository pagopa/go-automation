import { createHash } from 'node:crypto';

import type {
  AutomaticRunbookCatalogRevisionPayloadV1,
  AutomaticRunbookCatalogV1,
  AutomaticRunbookDescriptorV1,
  BuildAutomaticRunbookCatalogInputV1,
} from './AutomaticRunbookCatalogV1.js';
import {
  AUTOMATIC_RUNBOOK_CATALOG_SCHEMA_VERSION,
  AUTOMATIC_RUNBOOK_COMMAND_SCHEMA_VERSION,
  AutomaticRunbookKinds,
} from './AutomaticRunbookCatalogV1.js';
import { canonicalizeJson } from './canonicalJson.js';

const SHA_256_PATTERN = /^sha256-[a-f0-9]{64}$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const CATEGORY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function canonicalizeAutomaticRunbookCatalogPayload(payload: AutomaticRunbookCatalogRevisionPayloadV1): string {
  return canonicalizeJson(payload);
}

export function computeAutomaticRunbookCatalogRevision(payload: AutomaticRunbookCatalogRevisionPayloadV1): string {
  return `sha256-${createHash('sha256').update(canonicalizeAutomaticRunbookCatalogPayload(payload), 'utf8').digest('hex')}`;
}

export function buildAutomaticRunbookCatalog(input: BuildAutomaticRunbookCatalogInputV1): AutomaticRunbookCatalogV1 {
  const { publishedAt, release, ...payload } = input;
  validateRevisionPayload(payload);
  validatePublication(publishedAt, release.actorArn, release.changeNote);
  return { ...payload, revision: computeAutomaticRunbookCatalogRevision(payload), publishedAt, release };
}

export function validateAutomaticRunbookCatalog(catalog: AutomaticRunbookCatalogV1): void {
  const { revision, publishedAt, release, ...payload } = catalog;
  validateRevisionPayload(payload);
  validatePublication(publishedAt, release.actorArn, release.changeNote);
  if (!SHA_256_PATTERN.test(revision) || revision !== computeAutomaticRunbookCatalogRevision(payload)) {
    throw new Error('AutomaticRunbookCatalogV1 revision does not match its canonical payload');
  }
}

function validateRevisionPayload(payload: AutomaticRunbookCatalogRevisionPayloadV1): void {
  if (payload.schemaVersion !== AUTOMATIC_RUNBOOK_CATALOG_SCHEMA_VERSION) {
    throw new Error('Automatic runbook catalog schemaVersion must be 1');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(payload.environment)) {
    throw new Error('Automatic runbook catalog environment is invalid');
  }
  if (payload.worker.artifactRevision.trim() === '') throw new Error('Worker artifactRevision is required');
  if (payload.worker.commandSchemaVersion !== AUTOMATIC_RUNBOOK_COMMAND_SCHEMA_VERSION) {
    throw new Error('Unsupported automatic runbook command schema version');
  }
  const keys = new Set<string>();
  const alarms = new Set<string>();
  let previousKey: string | undefined;
  for (const descriptor of payload.runbooks) {
    validateDescriptor(descriptor);
    if (keys.has(descriptor.key)) throw new Error(`Duplicate automatic runbook key: ${descriptor.key}`);
    keys.add(descriptor.key);
    if (previousKey !== undefined && previousKey >= descriptor.key) {
      throw new Error('Automatic runbook descriptors must be sorted by key');
    }
    previousKey = descriptor.key;
    for (const alarmName of descriptor.alarmNames) {
      if (alarms.has(alarmName)) throw new Error(`Ambiguous automatic runbook alarm name: ${alarmName}`);
      alarms.add(alarmName);
    }
  }
}

function validateDescriptor(descriptor: AutomaticRunbookDescriptorV1): void {
  if (descriptor.key.trim() === '') throw new Error('Automatic runbook key is required');
  if (!SEMVER_PATTERN.test(descriptor.version)) throw new Error(`Invalid runbook SemVer: ${descriptor.key}`);
  if (descriptor.name.trim() === '') throw new Error(`Runbook name is required: ${descriptor.key}`);
  if (descriptor.team.trim() === '') throw new Error(`Runbook team is required: ${descriptor.key}`);
  if (!Object.values(AutomaticRunbookKinds).includes(descriptor.kind)) {
    throw new Error(`Invalid runbook kind: ${descriptor.key}`);
  }
  if (descriptor.categories.length === 0 || descriptor.categories.some((value) => !CATEGORY_PATTERN.test(value))) {
    throw new Error(`Invalid runbook categories: ${descriptor.key}`);
  }
  if (new Set(descriptor.categories).size !== descriptor.categories.length) {
    throw new Error(`Duplicate runbook categories: ${descriptor.key}`);
  }
  if (descriptor.alarmNames.length === 0 || descriptor.alarmNames.some((value) => value.trim() === '')) {
    throw new Error(`Runbook alarmNames are required: ${descriptor.key}`);
  }
  if (new Set(descriptor.alarmNames).size !== descriptor.alarmNames.length) {
    throw new Error(`Duplicate runbook alarmNames: ${descriptor.key}`);
  }
  if (!SHA_256_PATTERN.test(descriptor.definitionDigest)) {
    throw new Error(`Invalid runbook definitionDigest: ${descriptor.key}`);
  }
}

function validatePublication(publishedAt: string, actorArn: string, changeNote: string): void {
  if (Number.isNaN(Date.parse(publishedAt))) throw new Error('Catalog publishedAt must be ISO 8601');
  if (actorArn.trim() === '') throw new Error('Catalog release actorArn is required');
  if (changeNote.trim() === '') throw new Error('Catalog release changeNote is required');
}
