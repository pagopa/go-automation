import { createHash } from 'node:crypto';

import type {
  ExecuteRunbookQueueRegistryRevisionPayloadV1,
  ExecuteRunbookQueueRegistryV1,
} from './ExecuteRunbookQueueRegistryV1.js';

/** Canonical JSON: recursively sorted object keys, compact UTF-8 JSON, array order preserved. */
export function canonicalizeQueueRegistryPayload(payload: ExecuteRunbookQueueRegistryRevisionPayloadV1): string {
  return JSON.stringify(sortJsonValue(payload));
}

/** Lowercase SHA-256 hex of the canonical registry payload, excluding revision. */
export function computeQueueRegistryRevision(payload: ExecuteRunbookQueueRegistryRevisionPayloadV1): string {
  return createHash('sha256').update(canonicalizeQueueRegistryPayload(payload), 'utf8').digest('hex');
}

/** Builds a registry and derives its revision from the canonical payload. */
export function buildQueueRegistry(
  payload: ExecuteRunbookQueueRegistryRevisionPayloadV1,
): ExecuteRunbookQueueRegistryV1 {
  validateRevisionPayload(payload);
  return { ...payload, revision: computeQueueRegistryRevision(payload) };
}

/** Validates shape constraints and the owner-defined revision. */
export function validateQueueRegistry(registry: ExecuteRunbookQueueRegistryV1): void {
  const { revision, ...payload } = registry;
  validateRevisionPayload(payload);
  if (!/^[a-f0-9]{64}$/.test(revision) || revision !== computeQueueRegistryRevision(payload)) {
    throw new Error('ExecuteRunbookQueueRegistryV1 revision does not match its canonical payload');
  }
}

function validateRevisionPayload(payload: ExecuteRunbookQueueRegistryRevisionPayloadV1): void {
  if (payload.schemaVersion !== 1) throw new Error('Queue registry schemaVersion must be 1');
  if (Number.isNaN(Date.parse(payload.publishedAt))) throw new Error('Queue registry publishedAt must be ISO 8601');
  const entries = Object.entries(payload.queues);
  if (entries.length === 0) throw new Error('Queue registry must contain at least one region');
  for (const [region, queue] of entries) {
    if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) throw new Error(`Invalid queue region: ${region}`);
    if (
      !Number.isInteger(queue.messageRetentionSeconds) ||
      queue.messageRetentionSeconds < 60 ||
      queue.messageRetentionSeconds > 1_209_600
    ) {
      throw new Error(`Invalid messageRetentionSeconds for ${region}`);
    }
    if (!isExpectedQueueUrl(queue.queueUrl, region)) {
      throw new Error(`Queue URL does not match region ${region}`);
    }
    if (!isExpectedQueueArn(queue.queueArn, region)) {
      throw new Error(`Queue ARN does not match region ${region}`);
    }
    if (queue.stackName !== 'go-execute-runbook') throw new Error(`Stack name does not match the fixed worker name`);
  }
}

function isExpectedQueueUrl(value: string, region: string): boolean {
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split('/').filter(Boolean);
    return (
      url.protocol === 'https:' &&
      url.hostname === `sqs.${region}.amazonaws.com` &&
      pathParts.length === 2 &&
      /^\d{12}$/.test(pathParts[0] ?? '') &&
      pathParts[1] === 'go-execute-runbook.fifo'
    );
  } catch {
    return false;
  }
}

function isExpectedQueueArn(value: string, region: string): boolean {
  const parts = value.split(':');
  return (
    parts.length === 6 &&
    parts[0] === 'arn' &&
    parts[1] === 'aws' &&
    parts[2] === 'sqs' &&
    parts[3] === region &&
    /^\d{12}$/.test(parts[4] ?? '') &&
    parts[5] === 'go-execute-runbook.fifo'
  );
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return (value as unknown[]).map(sortJsonValue);
  if (typeof value !== 'object' || value === null) {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('Canonical JSON rejects non-finite numbers');
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  );
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftCodePoints = Array.from(left);
  const rightCodePoints = Array.from(right);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftCodePoints[index]?.codePointAt(0) ?? 0;
    const rightCodePoint = rightCodePoints[index]?.codePointAt(0) ?? 0;
    if (leftCodePoint < rightCodePoint) return -1;
    if (leftCodePoint > rightCodePoint) return 1;
  }
  if (leftCodePoints.length < rightCodePoints.length) return -1;
  if (leftCodePoints.length > rightCodePoints.length) return 1;
  return 0;
}
