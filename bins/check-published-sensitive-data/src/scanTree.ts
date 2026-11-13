import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { scanText } from './scanText.js';
import type { ScanTreeOptions } from './types/ScanTreeOptions.js';
import type { SensitiveFinding } from './types/SensitiveFinding.js';

/** Code points converted per `String.fromCodePoint` call. */
const UTF32_CHUNK = 8192;

/** Extensions that must be text: one the gate cannot decode is a finding, never skipped. */
const TEXT_EXTENSIONS: ReadonlyArray<string> = [
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.cts',
  '.map',
  '.json',
  '.md',
  '.txt',
];

/**
 * Scans every text file under `root`, whatever its extension: UTF-8 (with or without BOM),
 * UTF-16 (with BOM, or recognised by its NUL pattern) and UTF-32 (with BOM) are decoded; any
 * other file with a NUL byte, or whose decoding still contains NUL characters, is binary. A binary file with a text extension (`.js`, `.d.ts`, `.map`, `.json`,
 * `.md`, …) is reported as `unscannable-file` instead of being skipped.
 *
 * @param root - Directory to scan (an extracted package, or a package source directory)
 * @param options - Rules and forbidden entries
 * @returns The findings, ordered by path
 */
export async function scanTree(root: string, options: ScanTreeOptions): Promise<ReadonlyArray<SensitiveFinding>> {
  const findings: SensitiveFinding[] = [];
  for (const relativePath of await listFiles(root)) {
    if (options.skip?.(relativePath) === true) continue;
    if (isForbidden(relativePath, options)) {
      findings.push({ file: relativePath, line: 0, rule: 'forbidden-entry', value: relativePath });
      continue;
    }
    const text = decodeText(await fs.readFile(path.join(root, relativePath)));
    if (text !== undefined) {
      findings.push(...scanText(relativePath, text, options.rules));
    } else if (TEXT_EXTENSIONS.some((extension) => relativePath.endsWith(extension))) {
      findings.push({ file: relativePath, line: 0, rule: 'unscannable-file', value: relativePath });
    }
  }
  return findings;
}

/**
 * Decodes a file as text.
 *
 * @param content - Raw bytes
 * @returns The text, or `undefined` for a binary file
 */
export function decodeText(content: Buffer): string | undefined {
  const text = decodeByEncoding(content);
  // A wrong guess leaves NUL characters between the real ones, which no rule can match:
  // such a decoding is no decoding, and the caller reports a text file it cannot read.
  return text !== undefined && !text.includes('\u0000') ? text : undefined;
}

function decodeByEncoding(content: Buffer): string | undefined {
  // UTF-32 first: its little-endian BOM (FF FE 00 00) starts like the UTF-16 one.
  if (startsWith(content, [0xff, 0xfe, 0x00, 0x00])) return decodeUtf32(content.subarray(4), true);
  if (startsWith(content, [0x00, 0x00, 0xfe, 0xff])) return decodeUtf32(content.subarray(4), false);
  if (startsWith(content, [0xef, 0xbb, 0xbf])) return content.subarray(3).toString('utf8');
  if (startsWith(content, [0xff, 0xfe])) return content.subarray(2).toString('utf16le');
  if (startsWith(content, [0xfe, 0xff])) return swapBytes(content.subarray(2)).toString('utf16le');
  if (!content.includes(0)) return content.toString('utf8');
  const zeroParity = utf16ZeroParity(content);
  if (zeroParity === 1) return content.toString('utf16le');
  if (zeroParity === 0) return swapBytes(content).toString('utf16le');
  return undefined;
}

function startsWith(content: Buffer, prefix: ReadonlyArray<number>): boolean {
  return content.length >= prefix.length && prefix.every((byte, index) => content[index] === byte);
}

/** UTF-32 has no Node decoder: one code point per 4 bytes, or `undefined` when malformed. */
function decodeUtf32(content: Buffer, littleEndian: boolean): string | undefined {
  if (content.length % 4 !== 0) return undefined;
  const parts: string[] = [];
  let chunk: number[] = [];
  for (let offset = 0; offset < content.length; offset += 4) {
    const codePoint = littleEndian ? content.readUInt32LE(offset) : content.readUInt32BE(offset);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return undefined;
    chunk.push(codePoint);
    // Bounded calls: one String.fromCodePoint over the whole file exceeds the argument limit.
    if (chunk.length === UTF32_CHUNK) {
      parts.push(String.fromCodePoint(...chunk));
      chunk = [];
    }
  }
  parts.push(String.fromCodePoint(...chunk));
  return parts.join('');
}

/**
 * UTF-16 without BOM: the NUL bytes of ASCII text all sit on odd offsets (little endian) or
 * all on even ones (big endian). Anything else is binary.
 *
 * @returns 1 for little endian, 0 for big endian, `undefined` when not UTF-16 text
 */
function utf16ZeroParity(content: Buffer): 0 | 1 | undefined {
  if (content.length % 2 !== 0) return undefined;
  let even = 0;
  let odd = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== 0) continue;
    if (index % 2 === 0) even += 1;
    else odd += 1;
  }
  const units = content.length / 2;
  if (even === 0 && odd * 2 >= units) return 1;
  if (odd === 0 && even * 2 >= units) return 0;
  return undefined;
}

function swapBytes(content: Buffer): Buffer {
  const swapped = Buffer.from(content);
  swapped.swap16();
  return swapped;
}

function isForbidden(relativePath: string, options: ScanTreeOptions): boolean {
  const segments = relativePath.split('/');
  return (
    options.forbiddenPathSegments.some((segment) => segments.includes(segment)) ||
    options.forbiddenSuffixes.some((suffix) => relativePath.endsWith(suffix))
  );
}

async function listFiles(root: string): Promise<ReadonlyArray<string>> {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}
