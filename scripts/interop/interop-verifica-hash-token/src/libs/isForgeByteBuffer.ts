/**
 * Interface and type guard for node-forge ByteBuffer structure
 */
export interface ForgeByteBuffer {
  getBytes(): string;
  toHex(): string;
}

/**
 * Type guard for node-forge ByteBuffer
 */
export function isForgeByteBuffer(obj: unknown): obj is ForgeByteBuffer {
  return typeof obj === 'object' && obj !== null && 'getBytes' in obj && typeof obj.getBytes === 'function';
}
