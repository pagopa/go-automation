import { Core } from '@go-automation/go-common';

import type { SendMonitorAthenaQueryConfig } from '../types/index.js';

const OPERATORS: ReadonlyArray<Core.GOThresholdOperator> = ['>', '>=', '<', '<=', '==', '!='];
const AGGREGATIONS: ReadonlyArray<Core.GOThresholdAggregation> = ['any-row', 'count', 'sum', 'avg', 'min', 'max'];
const SEVERITIES: ReadonlyArray<Core.GOThresholdSeverity> = ['info', 'warning', 'critical'];

export function parseThresholdRules(config: SendMonitorAthenaQueryConfig): ReadonlyArray<Core.GOThresholdRule> {
  const ruleEntries = config.analysisRules.map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  if (ruleEntries.length > 0) {
    return ruleEntries.map((entry, index) => parseThresholdRule(entry, index));
  }

  if (config.analysisThresholdField !== undefined && config.analysisThreshold !== undefined) {
    return [
      {
        name: 'legacy-threshold',
        field: config.analysisThresholdField,
        operator: '>',
        value: config.analysisThreshold,
        aggregation: 'any-row',
        severity: 'warning',
      },
    ];
  }

  return [];
}

function parseThresholdRule(entry: string, index: number): Core.GOThresholdRule {
  const rawRule = entry.startsWith('{') ? parseJsonRule(entry, index) : parseDslRule(entry);
  const value = toNumber(rawRule['value'], `analysis.rules[${String(index)}].value`);
  const field = toOptionalString(rawRule['field']);
  const message = toOptionalString(rawRule['message']);
  const aggregation = toAggregation(rawRule['aggregation'] ?? 'any-row');

  if (aggregation !== 'count' && field === undefined) {
    throw new Error(
      `Invalid analysis rule at analysis.rules[${String(index)}]: field is required when aggregation is '${aggregation}'`,
    );
  }

  return {
    name: toOptionalString(rawRule['name']) ?? `rule-${String(index + 1)}`,
    ...(field !== undefined ? { field } : {}),
    operator: toOperator(rawRule['operator'] ?? '>'),
    value,
    aggregation,
    severity: toSeverity(rawRule['severity'] ?? 'warning'),
    ...(message !== undefined ? { message } : {}),
  };
}

function parseJsonRule(entry: string, index: number): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON analysis rule at analysis.rules[${String(index)}]: ${entry}`, { cause: error });
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Invalid JSON analysis rule at analysis.rules[${String(index)}]: expected an object. Entry: ${entry}`,
    );
  }
  return parsed as Record<string, unknown>;
}

function parseDslRule(entry: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const part of entry.split(';')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid analysis rule part '${part}'. Expected key=value.`);
    }

    result[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim();
  }

  return result;
}

function toNumber(value: unknown, label: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value for ${label}`);
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid numeric value for ${label}`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid numeric value for ${label}`);
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${label}`);
  }
  return parsed;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toOperator(value: unknown): Core.GOThresholdOperator {
  if (typeof value === 'string' && isOneOf(value, OPERATORS)) {
    return value;
  }
  throw new Error(`Invalid threshold operator '${String(value)}'. Expected one of: ${OPERATORS.join(', ')}`);
}

function toAggregation(value: unknown): Core.GOThresholdAggregation {
  if (typeof value === 'string' && isOneOf(value, AGGREGATIONS)) {
    return value;
  }
  throw new Error(`Invalid threshold aggregation '${String(value)}'. Expected one of: ${AGGREGATIONS.join(', ')}`);
}

function toSeverity(value: unknown): Core.GOThresholdSeverity {
  if (typeof value === 'string' && isOneOf(value, SEVERITIES)) {
    return value;
  }
  throw new Error(`Invalid threshold severity '${String(value)}'. Expected one of: ${SEVERITIES.join(', ')}`);
}

function isOneOf<TValue extends string>(value: string, allowed: ReadonlyArray<TValue>): value is TValue {
  return allowed.includes(value as TValue);
}
