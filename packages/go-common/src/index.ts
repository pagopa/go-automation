/**
 * go-common - Libreria condivisa per operazioni AWS e utilities
 *
 * Esportazioni principali:
 * - Core: Utilities, logging, config, importers, exporters
 * - AWS: Credentials management for SSO auto-login
 */

// Export core libraries
export * as Core from './libs/core/index.js';

// Export AWS credentials management
export * as AWS from './libs/aws/index.js';
