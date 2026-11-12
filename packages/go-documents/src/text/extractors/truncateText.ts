/**
 * Truncates `text` so that the UTF-8 byte length does not exceed `maxBytes`,
 * preserving full characters and surrogate pairs.
 *
 * Returns the truncated string and a boolean indicating whether truncation
 * actually happened.
 */
export function truncateText(text: string, maxBytes: number): { readonly text: string; readonly truncated: boolean } {
  if (maxBytes <= 0) {
    return { text: '', truncated: text.length > 0 };
  }
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= maxBytes) {
    return { text, truncated: false };
  }
  // Decode up to maxBytes, drop trailing partial character via stream-safe slice.
  const truncatedBuffer = buffer.subarray(0, maxBytes);
  // Walk back any trailing bytes that form an incomplete UTF-8 sequence.
  let end = truncatedBuffer.length;
  while (end > 0) {
    const byte = truncatedBuffer[end - 1];
    if (byte === undefined) break;
    // 0xxxxxxx → ASCII (single-byte); break here is safe.
    // 10xxxxxx → continuation byte; need to walk back.
    // 11xxxxxx → start of a multi-byte sequence; walk back one and break.
    if ((byte & 0b1100_0000) === 0b1000_0000) {
      end -= 1;
      continue;
    }
    if ((byte & 0b1000_0000) === 0) {
      break;
    }
    // Start byte of multi-byte sequence ⇒ remove it (incomplete) and stop.
    end -= 1;
    break;
  }
  return {
    text: truncatedBuffer.subarray(0, end).toString('utf8'),
    truncated: true,
  };
}
