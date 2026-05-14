import type { AWSMultiClientProvider } from './AWSMultiClientProvider.js';
import { AWSCloudWatchLogsService } from './AWSCloudWatchLogsService.js';

/**
 * High-level AWS service provider.
 *
 * Services are instantiated lazily on first access and backed by the
 * shared multi-client provider.
 */
export class AWSServiceProvider {
  private cachedCloudWatchLogsService: AWSCloudWatchLogsService | undefined;

  constructor(private readonly clientProvider: AWSMultiClientProvider) {}

  get cloudWatchLogs(): AWSCloudWatchLogsService {
    this.cachedCloudWatchLogsService ??= new AWSCloudWatchLogsService(this.clientProvider);
    return this.cachedCloudWatchLogsService;
  }

  close(): void {
    this.cachedCloudWatchLogsService = undefined;
  }
}
