import { GODateTokens } from '../core/utils/index.js';

export interface AWSAthenaQueryTemplateCompileOptions {
  readonly template: string;
  readonly values?: Readonly<Record<string, string>>;
  readonly rawValues?: Readonly<Record<string, string>>;
  readonly now?: Date;
  readonly from?: Date;
  readonly to?: Date;
  readonly timeZone?: string;
  readonly legacyAliases?: boolean;
}

export interface AWSAthenaCompiledQuery {
  readonly query: string;
  readonly parameters: ReadonlyArray<string>;
  readonly usedPlaceholders: ReadonlyArray<string>;
}

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
const RAW_VALUE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const LEGACY_INLINE_VALUE_PATTERN = /^[0-9:\-\s]+$/;

export class AWSAthenaQueryTemplateCompiler {
  compile(options: AWSAthenaQueryTemplateCompileOptions): AWSAthenaCompiledQuery {
    const parameters: string[] = [];
    const usedPlaceholders: string[] = [];
    const valueTokens = this.buildValueTokens(options);
    const legacyTokens = this.buildLegacyTokens(options);
    const rawValues = options.rawValues ?? {};

    const query = options.template.replace(PLACEHOLDER_PATTERN, (_match: string, key: string) => {
      addUnique(usedPlaceholders, key);

      if (key.startsWith('raw.')) {
        return this.resolveRawPlaceholder(key, rawValues);
      }

      const value = key.startsWith('param.') ? options.values?.[key.slice('param.'.length)] : valueTokens[key];
      if (value !== undefined) {
        parameters.push(value);
        return '?';
      }

      const legacyValue = legacyTokens[key];
      if (options.legacyAliases !== false && legacyValue !== undefined) {
        return legacyValue;
      }

      throw new Error(`Unknown Athena query placeholder: {{${key}}}`);
    });

    if (/\{\{|\}\}/.test(query)) {
      throw new Error('Invalid Athena query template: unresolved or malformed placeholder found');
    }

    return {
      query,
      parameters,
      usedPlaceholders,
    };
  }

  private buildValueTokens(options: AWSAthenaQueryTemplateCompileOptions): Readonly<Record<string, string>> {
    const timeZone = options.timeZone ?? 'UTC';
    const now = options.now ?? new Date();
    const nowTokens = GODateTokens.fromDate(now, 'now', timeZone);
    const tokens: Record<string, string> = {
      'now.dateTime': nowTokens['nowDateTime'] ?? GODateTokens.formatAthenaDateTime(now, timeZone),
      'now.date': nowTokens['nowDate'] ?? GODateTokens.formatAthenaDateTime(now, timeZone),
      'now.year': nowTokens['nowYear'] ?? '',
      'now.month': nowTokens['nowMonth'] ?? '',
      'now.day': nowTokens['nowDay'] ?? '',
      'now.hour': nowTokens['nowHour'] ?? '',
      'now.partitionHour': nowTokens['nowPartitionHour'] ?? '',
    };

    if (options.from !== undefined && options.to !== undefined) {
      const range = GODateTokens.fromRange(options.from, options.to, timeZone);
      Object.assign(tokens, {
        'range.start.dateTime': range.startDate,
        'range.start.date': range.startDate,
        'range.start.year': range.startYear,
        'range.start.month': range.startMonth,
        'range.start.day': range.startDay,
        'range.start.hour': range.startHour,
        'range.start.partitionHour': range.startPartitionHour,
        'range.end.dateTime': range.endDate,
        'range.end.date': range.endDate,
        'range.end.year': range.endYear,
        'range.end.month': range.endMonth,
        'range.end.day': range.endDay,
        'range.end.hour': range.endHour,
        'range.end.partitionHour': range.endPartitionHour,
      });
    }

    return tokens;
  }

  private buildLegacyTokens(options: AWSAthenaQueryTemplateCompileOptions): Readonly<Record<string, string>> {
    if (options.from === undefined || options.to === undefined) {
      return {};
    }

    const range = GODateTokens.fromRange(options.from, options.to, options.timeZone ?? 'UTC');
    const tokens: Record<string, string> = {
      startDate: range.startDate,
      startYear: range.startYear,
      startMonth: range.startMonth,
      startDay: range.startDay,
      startHour: range.startHour,
      startPartitionHour: range.startPartitionHour,
      endDate: range.endDate,
      endYear: range.endYear,
      endMonth: range.endMonth,
      endDay: range.endDay,
      endHour: range.endHour,
      endPartitionHour: range.endPartitionHour,
    };

    for (const [key, value] of Object.entries(tokens)) {
      if (!LEGACY_INLINE_VALUE_PATTERN.test(value)) {
        throw new Error(`Unsafe legacy placeholder value for {{${key}}}`);
      }
    }

    return tokens;
  }

  private resolveRawPlaceholder(key: string, rawValues: Readonly<Record<string, string>>): string {
    const rawKey = key.slice('raw.'.length);
    const value = rawValues[rawKey];
    if (value === undefined) {
      throw new Error(`Missing raw Athena query placeholder value: {{${key}}}`);
    }

    if (!RAW_VALUE_PATTERN.test(value)) {
      throw new Error(`Unsafe raw Athena query placeholder value for {{${key}}}`);
    }

    return value;
  }
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}
