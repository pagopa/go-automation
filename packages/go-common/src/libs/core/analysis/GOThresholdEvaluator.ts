import { valueToString } from '../utils/GOValueToString.js';

export type GOThresholdOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';
export type GOThresholdAggregation = 'any-row' | 'count' | 'sum' | 'avg' | 'min' | 'max';
export type GOThresholdSeverity = 'info' | 'warning' | 'critical';

export interface GOThresholdRule {
  readonly name: string;
  readonly field?: string;
  readonly operator: GOThresholdOperator;
  readonly value: number;
  readonly aggregation?: GOThresholdAggregation;
  readonly severity?: GOThresholdSeverity;
  readonly message?: string;
}

export interface GOThresholdRuleResult {
  readonly rule: GOThresholdRule;
  readonly breached: boolean;
  readonly observedValue: number;
  readonly comparedValue: number;
  readonly message: string;
  readonly severity: GOThresholdSeverity;
}

export interface GOThresholdEvaluation {
  readonly breached: boolean;
  readonly summary: string;
  readonly results: ReadonlyArray<GOThresholdRuleResult>;
}

export class GOThresholdEvaluator {
  evaluate(
    rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
    rules: ReadonlyArray<GOThresholdRule>,
  ): GOThresholdEvaluation {
    if (rules.length === 0) {
      return {
        breached: false,
        summary: 'No threshold rules configured',
        results: [],
      };
    }

    const results = rules.map((rule) => this.evaluateRule(rows, rule));
    const breached = results.some((result) => result.breached);
    const breachedNames = results.filter((result) => result.breached).map((result) => result.rule.name);

    return {
      breached,
      summary: breached ? `Threshold breached: ${breachedNames.join(', ')}` : 'All thresholds within limits',
      results,
    };
  }

  private evaluateRule(
    rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
    rule: GOThresholdRule,
  ): GOThresholdRuleResult {
    const aggregation = rule.aggregation ?? 'any-row';
    const severity = rule.severity ?? 'warning';
    const observedValue = this.computeObservedValue(rows, rule, aggregation);
    const breached = compare(observedValue, rule.operator, rule.value);

    return {
      rule,
      breached,
      observedValue,
      comparedValue: rule.value,
      message:
        rule.message ??
        `${rule.name}: observed ${String(observedValue)} ${rule.operator} ${String(rule.value)} (${aggregation})`,
      severity,
    };
  }

  private computeObservedValue(
    rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
    rule: GOThresholdRule,
    aggregation: GOThresholdAggregation,
  ): number {
    if (aggregation === 'count') {
      if (rule.field === undefined) {
        return rows.length;
      }
      return rows.filter((row) => row[rule.field as keyof typeof row] !== undefined).length;
    }

    if (rule.field === undefined) {
      throw new Error(`Threshold rule '${rule.name}' requires a field for aggregation '${aggregation}'`);
    }

    const values = rows
      .map((row) => toNumber(row[rule.field as keyof typeof row]))
      .filter((value): value is number => value !== undefined);

    if (values.length === 0) {
      return 0;
    }

    switch (aggregation) {
      case 'any-row':
        return selectAnyRowObservedValue(values, rule.operator, rule.value);
      case 'sum':
        return values.reduce((sum, value) => sum + value, 0);
      case 'avg':
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        throw new Error(`Unsupported threshold aggregation: ${valueToString(aggregation)}`);
    }
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (normalized.length === 0) {
      return undefined;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function selectAnyRowObservedValue(
  values: ReadonlyArray<number>,
  operator: GOThresholdOperator,
  expected: number,
): number {
  const matchingValue = values.find((value) => compare(value, operator, expected));
  if (matchingValue !== undefined) {
    return matchingValue;
  }

  if (operator === '<' || operator === '<=') {
    return Math.min(...values);
  }
  if (operator === '>' || operator === '>=') {
    return Math.max(...values);
  }
  return values[0] ?? 0;
}

function compare(observed: number, operator: GOThresholdOperator, expected: number): boolean {
  switch (operator) {
    case '>':
      return observed > expected;
    case '>=':
      return observed >= expected;
    case '<':
      return observed < expected;
    case '<=':
      return observed <= expected;
    case '==':
      return observed === expected;
    case '!=':
      return observed !== expected;
    default:
      throw new Error(`Unsupported threshold operator: ${valueToString(operator)}`);
  }
}
