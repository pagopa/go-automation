const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

type ByteUnit = (typeof BYTE_UNITS)[number];

export interface GOFormatBytesOptions {
  /**
   * Fixed number of fractional digits. When omitted, the formatter uses a
   * compact automatic precision.
   */
  readonly fractionDigits?: number;

  /**
   * Fixed number of fractional digits for scaled units only. Byte values still
   * use zero fractional digits.
   */
  readonly scaledFractionDigits?: number;

  /**
   * In automatic precision mode, values below this scaled amount keep one
   * fractional digit. Defaults to 10.
   */
  readonly autoFractionDigitsBelow?: number;
}

export function formatBytes(bytes: number, options: GOFormatBytesOptions = {}): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const unit = BYTE_UNITS[unitIndex] ?? 'B';
  const fractionDigits = getFractionDigits(value, unit, options);

  return `${value.toFixed(fractionDigits)} ${unit}`;
}

function getFractionDigits(value: number, unit: ByteUnit, options: GOFormatBytesOptions): number {
  if (options.fractionDigits !== undefined) return normalizeFractionDigits(options.fractionDigits);
  if (unit === 'B') return 0;
  if (options.scaledFractionDigits !== undefined) return normalizeFractionDigits(options.scaledFractionDigits);

  const threshold = options.autoFractionDigitsBelow ?? 10;
  return value < threshold ? 1 : 0;
}

function normalizeFractionDigits(fractionDigits: number): number {
  if (!Number.isFinite(fractionDigits)) return 0;
  return Math.min(Math.max(Math.trunc(fractionDigits), 0), 20);
}
