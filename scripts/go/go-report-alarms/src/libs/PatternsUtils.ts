import * as fs from 'fs/promises';
import * as path from 'path';

/** Type guard for config file structure */
interface IgnorePatternsConfig {
    ignorePatterns?: unknown;
}

// ============================================================================
// Private Helpers
// ============================================================================

/** Default ignore patterns used when no config file exists */
const DEFAULT_IGNORE_PATTERNS: ReadonlyArray<string> = [
    '-CumulativeAlarm',
    'workday-SLAViolations-',
    'autoscaling-rest',
    '-DLQ-IncreasingMessage',
    '-DLQ-HasMessage',
    'pn-paper-channel-autoscaling-custom',
    'pn-radd-SSL-Certificate-Expiration-Alarm',
    'pn-web-logout-api-ErrorAlarm',
    'pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm',
    'redshift-interop-analytics',
] as const;

/**
 * Validate and extract ignore patterns from parsed JSON
 */
export function validateIgnorePatterns(config: unknown): string[] {
    if (typeof config !== 'object' || config === null) {
        return [];
    }
    const typedConfig = config as IgnorePatternsConfig;
    if (!Array.isArray(typedConfig.ignorePatterns)) {
        return [];
    }
    return typedConfig.ignorePatterns.filter(
        (item): item is string => typeof item === 'string'
    );
}

/**
 * Load ignore patterns from config file
 * Falls back to default patterns if file doesn't exist or is invalid
 */
export async function loadIgnorePatterns(): Promise<ReadonlyArray<string>> {
    const configPath = path.join(__dirname, '../configs/ignore-patterns.json');

    try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const config: unknown = JSON.parse(configData);
        const patterns = validateIgnorePatterns(config);
        if (patterns.length > 0) {
            return patterns;
        }
    } catch {
        // Fall through to default patterns if file doesn't exist or is invalid
    }

    return DEFAULT_IGNORE_PATTERNS;
}