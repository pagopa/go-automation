import { DateTime } from 'luxon';

export interface GODateTokenRange {
  readonly startDate: string;
  readonly startYear: string;
  readonly startMonth: string;
  readonly startDay: string;
  readonly startHour: string;
  readonly startPartitionHour: string;
  readonly endDate: string;
  readonly endYear: string;
  readonly endMonth: string;
  readonly endDay: string;
  readonly endHour: string;
  readonly endPartitionHour: string;
}

export class GODateTokens {
  static parse(input: string, timeZone: string = 'UTC'): Date {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new Error('Date value cannot be empty');
    }

    if (/^\d{13}$/.test(trimmed)) {
      return new Date(Number(trimmed));
    }

    if (/^\d{10}$/.test(trimmed)) {
      return new Date(Number(trimmed) * 1000);
    }

    const parsers: ReadonlyArray<() => DateTime> = [
      () => DateTime.fromISO(trimmed, { zone: timeZone }),
      () => DateTime.fromSQL(trimmed, { zone: timeZone }),
      () => DateTime.fromFormat(trimmed, 'yyyy-MM-dd HH:mm:ss', { zone: timeZone }),
      () => DateTime.fromFormat(trimmed, 'yyyy-MM-dd HH:mm', { zone: timeZone }),
      () => DateTime.fromFormat(trimmed, 'yyyy-MM-dd', { zone: timeZone }).startOf('day'),
    ];

    for (const parse of parsers) {
      const parsed = parse();
      if (parsed.isValid) {
        return parsed.toJSDate();
      }
    }

    const fallback = new Date(trimmed);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback;
    }

    throw new Error(`Invalid date value: ${input}`);
  }

  static formatAthenaDateTime(date: Date, timeZone: string = 'UTC'): string {
    return GODateTokens.toDateTime(date, timeZone).toFormat('yyyy-MM-dd HH:mm:ss');
  }

  static fromRange(startDate: Date, endDate: Date, timeZone: string = 'UTC'): GODateTokenRange {
    const start = GODateTokens.toDateTime(startDate, timeZone);
    const end = GODateTokens.toDateTime(endDate, timeZone);

    return {
      startDate: GODateTokens.formatAthenaDateTime(startDate, timeZone),
      startYear: start.toFormat('yyyy'),
      startMonth: start.toFormat('MM'),
      startDay: start.toFormat('dd'),
      startHour: start.toFormat('HH'),
      startPartitionHour: start.toFormat('yyyyMMddHH'),
      endDate: GODateTokens.formatAthenaDateTime(endDate, timeZone),
      endYear: end.toFormat('yyyy'),
      endMonth: end.toFormat('MM'),
      endDay: end.toFormat('dd'),
      endHour: end.toFormat('HH'),
      endPartitionHour: end.toFormat('yyyyMMddHH'),
    };
  }

  static fromDate(date: Date, prefix: string, timeZone: string = 'UTC'): Readonly<Record<string, string>> {
    const value = GODateTokens.toDateTime(date, timeZone);

    return {
      [`${prefix}Date`]: GODateTokens.formatAthenaDateTime(date, timeZone),
      [`${prefix}DateTime`]: GODateTokens.formatAthenaDateTime(date, timeZone),
      [`${prefix}Year`]: value.toFormat('yyyy'),
      [`${prefix}Month`]: value.toFormat('MM'),
      [`${prefix}Day`]: value.toFormat('dd'),
      [`${prefix}Hour`]: value.toFormat('HH'),
      [`${prefix}PartitionHour`]: value.toFormat('yyyyMMddHH'),
    };
  }

  private static toDateTime(date: Date, timeZone: string): DateTime {
    const value = DateTime.fromJSDate(date).setZone(timeZone);
    if (!value.isValid) {
      throw new Error(`Invalid date/timezone combination: ${date.toISOString()} (${timeZone})`);
    }
    return value;
  }
}
