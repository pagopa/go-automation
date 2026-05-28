const DANGEROUS_KEY_VALUES = ['__proto__', 'constructor', 'prototype'] as const;

const DANGEROUS_KEYS = new Set<string>(DANGEROUS_KEY_VALUES);

export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

export function formatUnsafeKeyLocation(location: string, key: string): string {
  return location.length > 0 ? `${location}.${key}` : key;
}
