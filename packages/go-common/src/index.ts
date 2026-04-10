/**
 * go-common - Libreria condivisa per operazioni AWS e utilities
 *
 * Esportazioni principali:
 * - Core: Utilities, logging, config, importers, exporters
 * - SENDNotifications: SDK per notifiche digitali SEND
 * - AWS: Credentials management for SSO auto-login
 */

// Export core libraries
export * as Core from './libs/core/index.js';

// Export SEND Notifications SDK
export * as SEND from './libs/send/index.js';

// Export AWS credentials management
export * as AWS from './libs/aws/index.js';

