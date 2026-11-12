/** Where the scanner is in the top-level array. */
type ScannerPhase = 'start' | 'beforeElement' | 'element' | 'end';

/**
 * Splits a JSON document whose top-level value is an array into the source
 * text of its elements, chunk by chunk, so the array can be read with
 * constant memory: only the element being read is kept, never the whole
 * document. Each element text is then parsed on its own (`JSON.parse`).
 *
 * The scanner only tracks strings, escapes and nesting depth to find the
 * commas and the closing bracket of the top-level array; the syntax of each
 * element is left to `JSON.parse`. It does no I/O.
 *
 * When the first significant character is not `[` (an object, a scalar)
 * {@link isArray} becomes `false` and the caller is expected to fall back to
 * parsing the whole document.
 *
 * Complexity: O(N) in the document length; memory O(largest element).
 *
 * @example
 * ```typescript
 * const scanner = new GOJSONArrayScanner();
 * const texts = [...scanner.push('[{"a":1},'), ...scanner.push('{"a":2}]')];
 * scanner.end();
 * // texts: ['{"a":1}', '{"a":2}']
 * ```
 */
export class GOJSONArrayScanner {
  private phase: ScannerPhase = 'start';
  private topLevelArray: boolean | undefined;
  /** Text of the element being read that came from previous chunks. */
  private carry = '';
  private depth = 0;
  private inString = false;
  private escaped = false;
  private elements = 0;

  /**
   * Whether the document is an array: `undefined` until the first
   * significant character, then `true` (`[`) or `false` (anything else).
   */
  public get isArray(): boolean | undefined {
    return this.topLevelArray;
  }

  /**
   * Feeds the next chunk of the document.
   *
   * @param chunk - Next decoded chunk of text
   * @returns Source text of the elements completed in this chunk, in order
   * @throws {SyntaxError} When the array structure is malformed (stray comma,
   *   unbalanced bracket, content after the closing bracket)
   */
  public push(chunk: string): string[] {
    const completed: string[] = [];
    if (this.topLevelArray === false) return completed;
    let elementStart = this.phase === 'element' ? 0 : -1;

    for (let i = 0; i < chunk.length; i++) {
      const char = chunk.charAt(i);
      switch (this.phase) {
        case 'start':
          if (isWhitespace(char) || char === '﻿') continue;
          this.topLevelArray = char === '[';
          if (!this.topLevelArray) return completed;
          this.phase = 'beforeElement';
          continue;
        case 'beforeElement':
          if (isWhitespace(char)) continue;
          if (char === ']' && this.elements === 0) {
            this.phase = 'end';
            continue;
          }
          if (char === ',' || char === ']') throw this.syntaxError(`unexpected "${char}"`);
          this.phase = 'element';
          elementStart = i;
          this.scanElementChar(char);
          continue;
        case 'element':
          if (this.inString || this.depth > 0 || (char !== ',' && char !== ']')) {
            this.scanElementChar(char);
            continue;
          }
          completed.push((this.carry + chunk.slice(elementStart, i)).trim());
          this.carry = '';
          this.elements += 1;
          elementStart = -1;
          this.phase = char === ',' ? 'beforeElement' : 'end';
          continue;
        case 'end':
          if (!isWhitespace(char)) throw this.syntaxError(`unexpected "${char}" after the end of the array`);
          continue;
        default:
          throw new Error(`Unknown scanner phase: ${String(this.phase)}`);
      }
    }

    if (this.phase === 'element') this.carry += chunk.slice(elementStart);
    return completed;
  }

  /**
   * Signals the end of the document.
   *
   * @throws {SyntaxError} When the document is an array that was not closed
   */
  public end(): void {
    if (this.topLevelArray === true && this.phase !== 'end') {
      throw this.syntaxError('unexpected end of input, the array is not closed');
    }
  }

  /** Tracks strings and nesting inside an element. */
  private scanElementChar(char: string): void {
    if (this.inString) {
      if (this.escaped) this.escaped = false;
      else if (char === '\\') this.escaped = true;
      else if (char === '"') this.inString = false;
      return;
    }
    if (char === '"') this.inString = true;
    else if (char === '{' || char === '[') this.depth += 1;
    else if (char === '}' || char === ']') {
      if (this.depth === 0) throw this.syntaxError(`unbalanced "${char}"`);
      this.depth -= 1;
    }
  }

  private syntaxError(detail: string): SyntaxError {
    return new SyntaxError(`Invalid JSON array (element ${this.elements + 1}): ${detail}`);
  }
}

/** JSON insignificant whitespace (RFC 8259). */
function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}
