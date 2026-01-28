/**
 * Generic event handler function type
 */
export type GOEventHandler<TPayload = unknown> = (payload: TPayload) => void | Promise<void>;

export interface GOEventEmitter<TEvents extends object> {
  /**
   * Register an event listener
   */
  on<TEvent extends keyof TEvents>(event: TEvent, handler: GOEventHandler<TEvents[TEvent]>): void;

  /**
   * Remove an event listener
   */
  off<TEvent extends keyof TEvents>(event: TEvent, handler: GOEventHandler<TEvents[TEvent]>): void;

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   */
  removeAllListeners<TEvent extends keyof TEvents>(event?: TEvent): void;
}
