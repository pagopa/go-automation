/**
 * Secrets Specifier
 *
 * Defines which configuration keys should be treated as secrets and redacted.
 */

/**
 * Specifies how to identify secret configuration values
 */
export type GOSecretPredicate = (key: string, value: string | string[]) => boolean;

export type GOSecretsSpecifier =
  | { type: 'none' }
  | { type: 'all' }
  | { type: 'specific'; keys: string[] }
  | { type: 'dynamic'; predicate: GOSecretPredicate };

/**
 * Factory functions for creating secret specifiers
 */
export class GOSecretsSpecifierFactory {
  /**
   * No secrets - all values are displayed
   */
  static none(): GOSecretsSpecifier {
    return { type: 'none' };
  }

  /**
   * All values are secrets
   */
  static all(): GOSecretsSpecifier {
    return { type: 'all' };
  }

  /**
   * Specific keys are secrets
   * @param keys - Array of keys to treat as secrets
   */
  static specific(keys: string[]): GOSecretsSpecifier {
    return { type: 'specific', keys };
  }

  /**
   * Dynamic predicate to determine if a key is secret
   * @param predicate - Function that returns true if key/value is secret
   */
  static dynamic(predicate: GOSecretPredicate): GOSecretsSpecifier {
    return { type: 'dynamic', predicate };
  }
}

/**
 * Handles secret detection and redaction
 */
export class GOSecretRedactor {
  constructor(private readonly specifier: GOSecretsSpecifier = GOSecretsSpecifierFactory.none()) {}

  /**
   * Check if a key/value pair should be treated as secret
   */
  isSecret(key: string, value: string | string[]): boolean {
    switch (this.specifier.type) {
      case 'none':
        return false;

      case 'all':
        return true;

      case 'specific':
        return this.specifier.keys.includes(key);

      case 'dynamic':
        return this.specifier.predicate(key, value);

      default:
        return false;
    }
  }

  /**
   * Redact a value for display
   */
  redact(value: string | string[]): string {
    if (Array.isArray(value)) {
      return `[REDACTED (${value.length} items)]`;
    }
    return `[REDACTED (${value.length} chars)]`;
  }
}
