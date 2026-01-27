/**
 * Main SDK class for convenient access to all services
 */

import { GOHttpClient } from '../core/network/GOHttpClient.js';

import { SENDF24MetadataBuilder } from './builders/SENDF24MetadataBuilder.js';
import { SENDNotificationBuilder } from './builders/SENDNotificationBuilder.js';
import { SENDPagoPaPaymentBuilder } from './builders/SENDPagoPaPaymentBuilder.js';
import { SENDAttachmentService } from './services/attachment/SENDAttachmentService.js';
import type { SENDNotificationServiceConfig } from './services/notification/models/SENDNotificationServiceConfig.js';
import { SENDNotificationService } from './services/notification/SENDNotificationService.js';

/**
 * Main SDK class providing access to all services
 */
export class SENDNotifications {
  /** Notification service for sending and managing notifications */
  public readonly notifications: SENDNotificationService;

  /** File manager for uploading documents */
  public readonly attachment: SENDAttachmentService;

  /** HTTP client (if you need direct access) */
  public readonly http: GOHttpClient;

  constructor(config: SENDNotificationServiceConfig) {
    this.http = new GOHttpClient({
      baseUrl: config.basePath,
      defaultHeaders: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      proxyUrl: config.proxyUrl,
      timeout: config.timeout,
      debug: config.debug,
    });
    this.notifications = new SENDNotificationService(config);
    this.attachment = new SENDAttachmentService(this.http);
  }

  /**
   * Create a new notification builder
   */
  createNotificationBuilder(): SENDNotificationBuilder {
    return new SENDNotificationBuilder();
  }

  /**
   * Create a new PagoPA payment builder
   */
  createPagoPaPaymentBuilder(): SENDPagoPaPaymentBuilder {
    return new SENDPagoPaPaymentBuilder();
  }

  /**
   * Create a new F24 metadata builder
   */
  createF24MetadataBuilder(): SENDF24MetadataBuilder {
    return new SENDF24MetadataBuilder();
  }
}
