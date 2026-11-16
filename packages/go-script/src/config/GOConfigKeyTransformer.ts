/**
 * Configuration Key Transformer
 *
 * Handles transformation of hierarchical configuration keys into different formats:
 * - Environment variables (HTTP_SERVER_TIMEOUT)
 * - CLI flags (--http-server-timeout)
 * - Normalized internal format (http.server.timeout)
 */

/**
 * Transforms configuration keys between different naming conventions
 */
export class GOConfigKeyTransformer {
  /**
   * Convert hierarchical key to environment variable format
   * @param key - Hierarchical key (e.g., "http.serverTimeout")
   * @returns Environment variable name (e.g., "HTTP_SERVER_TIMEOUT")
   *
   * @example
   * "http.serverTimeout" -> "HTTP_SERVER_TIMEOUT"
   * "api.v2.endpoint" -> "API_V2_ENDPOINT"
   */
  static toEnvironmentKey(key: string): string {
    return key
      .split('.')
      .flatMap((part) => this.splitCamelCase(part))
      .join('_')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
  }

  /**
   * Convert hierarchical key to CLI flag format
   * @param key - Hierarchical key (e.g., "http.serverTimeout")
   * @returns CLI flag (e.g., "--http-server-timeout")
   *
   * @example
   * "http.serverTimeout" -> "--http-server-timeout"
   * "api.v2.endpoint" -> "--api-v2-endpoint"
   */
  static toCLIFlag(key: string): string {
    return `--${key
      .split('.')
      .flatMap((part) => this.splitCamelCase(part))
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')}`;
  }

  /**
   * Normalize a key to internal hierarchical format
   * Handles dots, underscores, and camelCase
   *
   * @param key - Key in any format
   * @returns Normalized key with dots
   *
   * @example
   * "HTTP_SERVER_TIMEOUT" -> "http.server.timeout"
   * "--http-server-timeout" -> "http.server.timeout"
   * "httpServerTimeout" -> "http.server.timeout"
   */
  static normalize(key: string): string {
    // Remove leading dashes from CLI flags
    let normalized = key.replace(/^--?/, '');

    // Convert underscores and dashes to dots
    normalized = normalized.replace(/[_-]/g, '.');

    // Split camelCase into separate parts
    normalized = normalized
      .split('.')
      .flatMap((part) => this.splitCamelCase(part))
      .join('.');

    return normalized.toLowerCase();
  }

  /**
   * Try to match a normalized key against an environment variable name
   * @param normalizedKey - Normalized key (e.g., "http.timeout")
   * @param envKey - Environment variable name (e.g., "HTTP_TIMEOUT")
   * @returns True if they match
   */
  static matchesEnvironmentKey(normalizedKey: string, envKey: string): boolean {
    return this.toEnvironmentKey(normalizedKey) === envKey;
  }

  /**
   * Try to match a normalized key against a CLI flag
   * @param normalizedKey - Normalized key (e.g., "http.timeout")
   * @param cliFlag - CLI flag (e.g., "--http-timeout")
   * @returns True if they match
   */
  static matchesCLIFlag(normalizedKey: string, cliFlag: string): boolean {
    return this.toCLIFlag(normalizedKey) === cliFlag;
  }

  /**
   * Split camelCase string into separate words
   * @param str - CamelCase string
   * @returns Array of lowercase words
   *
   * @example
   * "serverTimeout" -> ["server", "timeout"]
   * "HTTPClient" -> ["http", "client"]
   * "v2API" -> ["v2", "api"]
   */
  private static splitCamelCase(str: string): string[] {
    // Handle empty strings
    if (!str) return [];

    // Insert dots before uppercase letters that follow lowercase letters
    // or before uppercase letters that are followed by lowercase letters
    const withDots = str
      .replace(/([a-z])([A-Z])/g, '$1.$2') // camelCase -> camel.Case
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1.$2'); // HTTPSClient -> HTTPS.Client

    return withDots.split('.');
  }

  /**
   * Convert environment variable name back to normalized key
   * @param envKey - Environment variable name (e.g., "HTTP_SERVER_TIMEOUT")
   * @returns Normalized key (e.g., "http.server.timeout")
   */
  static fromEnvironmentKey(envKey: string): string {
    return envKey.toLowerCase().replace(/_/g, '.');
  }

  /**
   * Convert CLI flag back to normalized key
   * @param cliFlag - CLI flag (e.g., "--http-server-timeout")
   * @returns Normalized key (e.g., "http.server.timeout")
   */
  static fromCLIFlag(cliFlag: string): string {
    return cliFlag.replace(/^--?/, '').replace(/-/g, '.');
  }
}
