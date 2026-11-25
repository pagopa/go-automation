import { once } from 'node:events';
import type { Writable } from 'node:stream';

import type { GOJSONStreamWriterOptions } from './GOJSONStreamWriterOptions.js';

/** Text handed to the stream in one write: large enough to keep writes few, small enough to bound the memory. */
const PIECE_LENGTH = 1 << 16;

/** The widest indentation `JSON.stringify` accepts. */
const MAX_INDENT = 10;

/**
 * Writes a value on a stream as JSON, piece by piece, with the same text as
 * `JSON.stringify(value, null, indent)`: a value whose text is too long for a
 * single string (an execution trace with thousands of steps) is still written,
 * and only one piece is in memory at a time.
 *
 * - It follows `JSON.stringify`: `toJSON`, values without a JSON form (omitted
 *   in objects, `null` in arrays), non-finite numbers, boxed primitives.
 * - It honors backpressure: when the stream asks to wait, it waits for `drain`.
 * - It never ends the stream: whoever opened it ends it.
 *
 * The writing is the counterpart of `GOJSONArrayScanner`, which reads
 * a large JSON piece by piece.
 *
 * @example
 * ```typescript
 * const stream = createWriteStream('trace.json');
 * await new GOJSONStreamWriter({ indent: 2 }).write(trace, stream);
 * stream.end();
 * ```
 */
export class GOJSONStreamWriter {
  private readonly gap: string;

  constructor(options: GOJSONStreamWriterOptions = {}) {
    this.gap = ' '.repeat(Math.max(0, Math.min(MAX_INDENT, options.indent ?? 0)));
  }

  /**
   * Writes the JSON text of a value on the stream.
   *
   * @param value - The value to write
   * @param stream - The destination, left open
   * @returns Resolves when the last piece is handed to the stream
   * @throws {TypeError} When the value has no JSON form, holds a circular
   *   structure or a `BigInt`; or the error of the stream
   */
  async write(value: unknown, stream: Writable): Promise<void> {
    // The error of the stream is reported by the returned promise, not by the event.
    const failure: { error?: Error } = {};
    const onError = (error: Error): void => {
      failure.error ??= error;
    };
    stream.on('error', onError);
    try {
      let buffer = '';
      for (const piece of this.pieces(withToJson('', value))) {
        buffer += piece;
        if (buffer.length >= PIECE_LENGTH) {
          await handOver(stream, buffer, failure);
          buffer = '';
        }
      }
      if (buffer !== '') await handOver(stream, buffer, failure);
    } finally {
      stream.off('error', onError);
    }
  }

  /**
   * The JSON text of a value whose `toJSON` has already run, in pieces.
   * Complexity: O(N) in the size of the value; memory O(depth).
   */
  private *pieces(top: unknown): Generator<string> {
    if (isOmitted(top)) throw new TypeError('The value has no JSON representation');
    const ancestors = new Set<object>();
    const gap = this.gap;

    function* serialize(current: unknown, indent: string): Generator<string> {
      if (current === null || typeof current !== 'object' || isBoxedPrimitive(current)) {
        yield JSON.stringify(current);
        return;
      }
      if (ancestors.has(current)) throw new TypeError('Converting circular structure to JSON');
      ancestors.add(current);
      const inner = indent + gap;
      const open = gap === '' ? '' : `\n${inner}`;
      const separator = `,${open}`;
      const close = gap === '' ? '' : `\n${indent}`;
      if (Array.isArray(current)) {
        if (current.length === 0) {
          yield '[]';
        } else {
          yield `[${open}`;
          for (const [index, item] of current.entries()) {
            if (index > 0) yield separator;
            const element = withToJson(String(index), item);
            if (isOmitted(element)) yield 'null';
            else yield* serialize(element, inner);
          }
          yield `${close}]`;
        }
      } else {
        const entries = Object.entries(current)
          .map(([key, item]): readonly [string, unknown] => [key, withToJson(key, item)])
          .filter(([, item]) => !isOmitted(item));
        if (entries.length === 0) {
          yield '{}';
        } else {
          yield `{${open}`;
          for (const [index, [key, item]] of entries.entries()) {
            if (index > 0) yield separator;
            yield `${JSON.stringify(key)}:${gap === '' ? '' : ' '}`;
            yield* serialize(item, inner);
          }
          yield `${close}}`;
        }
      }
      ancestors.delete(current);
    }

    yield* serialize(top, '');
  }
}

/** Hands a piece to the stream, waiting for `drain` when the stream asks to. */
async function handOver(stream: Writable, piece: string, failure: { readonly error?: Error }): Promise<void> {
  if (failure.error !== undefined) throw failure.error;
  if (!stream.write(piece)) await once(stream, 'drain');
}

/** The value `JSON.stringify` writes in place of one with a `toJSON` method. */
function withToJson(key: string, value: unknown): unknown {
  return hasToJson(value) ? value.toJSON(key) : value;
}

function hasToJson(value: unknown): value is { toJSON(key: string): unknown } {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'bigint') &&
    typeof (value as Record<string, unknown>)['toJSON'] === 'function'
  );
}

/** Values without a JSON form: omitted in an object, `null` in an array. */
function isOmitted(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

/** `new Number(1)`, `new String('s')`, `new Boolean(false)`: written as their primitive value. */
function isBoxedPrimitive(value: object): boolean {
  return value instanceof Number || value instanceof String || value instanceof Boolean;
}
