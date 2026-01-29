/**
 * GOValueToString - Safe value-to-string conversion utilities
 *
 * Provides type-safe conversion of unknown values to string representation
 * without the pitfalls of naive Object.toString() or JSON.stringify().
 *
 * Handles edge cases:
 * - null/undefined -> empty string
 * - Date -> ISO string
 * - Buffer -> base64
 * - Map -> JSON object from entries
 * - Set -> JSON array
 * - Error -> JSON with name/message
 * - RegExp -> pattern string
 * - BigInt -> string (JSON.stringify throws on BigInt)
 * - Circular references -> [Circular] marker
 */

/**
 * Options for value stringification
 */
export interface GOValueToStringOptions {
  /** Value to return for null (default: '') */
  readonly nullValue?: string;
  /** Value to return for undefined (default: '') */
  readonly undefinedValue?: string;
  /** How to format Date objects (default: 'iso') */
  readonly dateFormat?: 'iso' | 'locale' | 'timestamp';
  /** How to format Buffer objects (default: 'base64') */
  readonly bufferFormat?: 'base64' | 'utf8' | 'hex';
  /** Whether to handle circular references (default: true) */
  readonly handleCircular?: boolean;
  /** Max depth for object serialization (default: 10) */
  readonly maxDepth?: number;
}

const DEFAULT_OPTIONS: Required<GOValueToStringOptions> = {
  nullValue: '',
  undefinedValue: '',
  dateFormat: 'iso',
  bufferFormat: 'base64',
  handleCircular: true,
  maxDepth: 10,
};

/**
 * Safely stringify a value to JSON, handling circular references and special types.
 *
 * @param value - Value to stringify
 * @param options - Stringify options
 * @returns JSON string representation
 *
 * @example
 * ```typescript
 * safeJsonStringify({ a: 1 });           // '{"a":1}'
 * safeJsonStringify(circularObj);        // '{"ref":"[Circular]"}'
 * safeJsonStringify(123n);               // '"123"' (BigInt as string)
 * ```
 */
export function safeJsonStringify(
  value: unknown,
  options?: {
    readonly handleCircular?: boolean;
    readonly maxDepth?: number;
    readonly indent?: number;
  },
): string {
  const handleCircular = options?.handleCircular ?? true;
  const maxDepth = options?.maxDepth ?? 10;
  const indent = options?.indent;

  if (!handleCircular) {
    return JSON.stringify(value, null, indent);
  }

  const seen = new WeakSet();
  let currentDepth = 0;

  return JSON.stringify(
    value,
    function (_key: string, val: unknown): unknown {
      // Handle BigInt
      if (typeof val === 'bigint') {
        return val.toString();
      }

      // Handle non-objects as-is
      if (typeof val !== 'object' || val === null) {
        return val;
      }

      // Check depth
      if (currentDepth > maxDepth) {
        return '[Max Depth]';
      }

      // Check circular
      if (seen.has(val)) {
        return '[Circular]';
      }

      seen.add(val);
      currentDepth++;

      return val;
    },
    indent,
  );
}

/**
 * Convert any value to a string representation safely.
 *
 * Design decisions:
 * - null/undefined -> empty string (export-friendly)
 * - primitives -> their string representation
 * - Date -> ISO string (standardized, parseable)
 * - Buffer -> base64 (reversible)
 * - Error -> JSON with name/message
 * - Map -> JSON object from entries
 * - Set -> JSON array
 * - RegExp -> pattern string
 * - BigInt -> string (JSON.stringify throws on BigInt)
 * - Symbol -> description or empty
 * - Function -> empty string (not serializable)
 * - Object -> JSON with circular reference handling
 *
 * Complexity: O(n) where n is the size of the value's serialized form
 *
 * @param value - Any value to convert
 * @param options - Conversion options
 * @returns String representation safe for export
 *
 * @example
 * ```typescript
 * valueToString(null);                    // ''
 * valueToString(42);                      // '42'
 * valueToString(new Date());              // '2024-01-29T10:30:00.000Z'
 * valueToString(new Map([['a', 1]]));     // '{"a":1}'
 * valueToString(new Set([1, 2, 3]));      // '[1,2,3]'
 * valueToString({ circular: ref });       // '{"circular":"[Circular]"}'
 * valueToString(123n);                    // '123'
 * ```
 */
export function valueToString(value: unknown, options?: GOValueToStringOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Handle null and undefined first
  if (value === null) {
    return opts.nullValue;
  }
  if (value === undefined) {
    return opts.undefinedValue;
  }

  // Handle primitives
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Handle symbol
  if (typeof value === 'symbol') {
    return value.description ?? '';
  }

  // Handle function
  if (typeof value === 'function') {
    return '';
  }

  // Handle Date
  if (value instanceof Date) {
    switch (opts.dateFormat) {
      case 'iso':
        return value.toISOString();
      case 'locale':
        return value.toLocaleString();
      case 'timestamp':
        return value.getTime().toString();
      default:
        return value.toISOString();
    }
  }

  // Handle Buffer
  if (Buffer.isBuffer(value)) {
    switch (opts.bufferFormat) {
      case 'base64':
        return value.toString('base64');
      case 'utf8':
        return value.toString('utf8');
      case 'hex':
        return value.toString('hex');
      default:
        return value.toString('base64');
    }
  }

  // Handle Error (before generic object check)
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
    });
  }

  // Handle RegExp
  if (value instanceof RegExp) {
    return value.toString();
  }

  // Handle Map
  if (value instanceof Map) {
    return safeJsonStringify(Object.fromEntries(value), {
      handleCircular: opts.handleCircular,
      maxDepth: opts.maxDepth,
    });
  }

  // Handle Set
  if (value instanceof Set) {
    return safeJsonStringify([...value], {
      handleCircular: opts.handleCircular,
      maxDepth: opts.maxDepth,
    });
  }

  // Handle Array and Object
  if (typeof value === 'object') {
    return safeJsonStringify(value, {
      handleCircular: opts.handleCircular,
      maxDepth: opts.maxDepth,
    });
  }

  // Fallback (should never reach here)
  return '';
}

// isPrimitive is now exported from GOTypeGuards.ts
