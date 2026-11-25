/** AWS services with remotely running operations that require explicit cleanup. */
export type AWSRemoteOperationService = 'LOGS' | 'ATHENA';

/** Bounded warning emitted when a remote operation cannot be stopped. */
export interface AWSRemoteCleanupWarning {
  readonly service: AWSRemoteOperationService;
  readonly operationId: string;
  readonly code: 'REMOTE_QUERY_STOP_FAILED';
  readonly message: string;
}

export type AWSRemoteCleanupWarningHandler = (warning: AWSRemoteCleanupWarning) => void;

export interface AWSRemoteOperation {
  readonly service: AWSRemoteOperationService;
  readonly operationId: string;
  stop(signal: AbortSignal): Promise<void>;
}

export interface AWSRegisteredOperation {
  stop(): Promise<AWSRemoteCleanupWarning | undefined>;
  unregister(): void;
}

interface AWSActiveOperationEntry {
  readonly operation: AWSRemoteOperation;
  stopPromise?: Promise<AWSRemoteCleanupWarning | undefined>;
}

/** Per-execution registry used to stop active AWS queries exactly once. */
export class AWSActiveOperationRegistry {
  private readonly operations = new Map<string, AWSActiveOperationEntry>();

  constructor(private readonly cleanupTimeoutMs: number = 5_000) {
    if (!Number.isInteger(cleanupTimeoutMs) || cleanupTimeoutMs < 1 || cleanupTimeoutMs > 30_000) {
      throw new Error('AWS remote cleanup timeout must be an integer between 1 and 30000 milliseconds');
    }
  }

  register(operation: AWSRemoteOperation): AWSRegisteredOperation {
    const key = operationKey(operation);
    if (this.operations.has(key)) {
      throw new Error(`AWS remote operation already registered: ${key}`);
    }
    const entry: AWSActiveOperationEntry = { operation };
    this.operations.set(key, entry);
    return {
      stop: async (): Promise<AWSRemoteCleanupWarning | undefined> => this.stop(key, entry),
      unregister: (): void => {
        if (this.operations.get(key) === entry) this.operations.delete(key);
      },
    };
  }

  async stopAll(): Promise<ReadonlyArray<AWSRemoteCleanupWarning>> {
    const warnings = await Promise.all(
      [...this.operations.entries()].map(async ([key, entry]) => this.stop(key, entry)),
    );
    return warnings.filter((warning): warning is AWSRemoteCleanupWarning => warning !== undefined);
  }

  get size(): number {
    return this.operations.size;
  }

  private async stop(key: string, entry: AWSActiveOperationEntry): Promise<AWSRemoteCleanupWarning | undefined> {
    if (entry.stopPromise !== undefined) {
      return await entry.stopPromise;
    }

    entry.stopPromise = this.stopOperation(entry.operation).finally(() => {
      if (this.operations.get(key) === entry) this.operations.delete(key);
    });
    return await entry.stopPromise;
  }

  private async stopOperation(operation: AWSRemoteOperation): Promise<AWSRemoteCleanupWarning | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cleanupTimeoutMs);
    try {
      await operation.stop(controller.signal);
      return undefined;
    } catch (error: unknown) {
      return {
        service: operation.service,
        operationId: operation.operationId,
        code: 'REMOTE_QUERY_STOP_FAILED',
        message: boundedErrorMessage(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function operationKey(operation: AWSRemoteOperation): string {
  return `${operation.service}:${operation.operationId}`;
}

function boundedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1_024);
}
