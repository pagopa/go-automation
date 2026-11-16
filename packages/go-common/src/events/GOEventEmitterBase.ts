import type { GOEventEmitter, GOEventHandler } from './GOEventEmitter.js';

/**
 * Generic Event Emitter
 * Provides type-safe event emission and listener registration
 */
export class GOEventEmitterBase<TEventMap extends object> implements GOEventEmitter<TEventMap> {
  private listeners: Partial<Record<keyof TEventMap, GOEventHandler<unknown>[]>> = {};

  /**
   * Register an event listener
   * Multiple listeners can be registered for the same event
   *
   * @param event - The event name
   * @param handler - The handler function to call when event is emitted
   */
  on<TEvent extends keyof TEventMap>(event: TEvent, handler: GOEventHandler<TEventMap[TEvent]>): void {
    const handlers = this.listeners[event] ?? [];
    handlers.push(handler as GOEventHandler<unknown>);
    this.listeners[event] = handlers;
  }

  /**
   * Remove an event listener
   *
   * @param event - The event name
   * @param handler - The handler function to remove
   */
  off<TEvent extends keyof TEventMap>(event: TEvent, handler: GOEventHandler<TEventMap[TEvent]>): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   *
   * @param event - Optional event name. If not provided, removes all listeners
   */
  removeAllListeners<TEvent extends keyof TEventMap>(event?: TEvent): void {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }

  /**
   * Get the number of listeners for a specific event
   *
   * @param event - The event name
   * @returns The number of registered listeners for the event
   */
  listenerCount<TEvent extends keyof TEventMap>(event: TEvent): number {
    return this.listeners[event]?.length ?? 0;
  }

  /**
   * Emit an event to all registered listeners
   * Listeners are called in the order they were registered
   *
   * @param event - The event name
   * @param payload - The event payload
   */
  protected emit<TEvent extends keyof TEventMap>(event: TEvent, payload: TEventMap[TEvent]): void {
    const handlers = this.listeners[event];
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        const result = handler(payload);
        // If handler returns a promise, catch any errors
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            console.error(`Error in async event handler for "${String(event)}":`, error);
          });
        }
      } catch (error) {
        // Log error but don't stop other handlers
        console.error(`Error in event handler for "${String(event)}":`, error);
      }
    }
  }

  /**
   * Emit an event asynchronously and wait for all handlers to complete
   *
   * @param event - The event name
   * @param payload - The event payload
   */
  protected async emitAsync<TEvent extends keyof TEventMap>(event: TEvent, payload: TEventMap[TEvent]): Promise<void> {
    const handlers = this.listeners[event];
    if (!handlers) return;

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(payload);
        } catch (error) {
          console.error(`Error in async event handler for "${String(event)}":`, error);
        }
      }),
    );
  }
}
