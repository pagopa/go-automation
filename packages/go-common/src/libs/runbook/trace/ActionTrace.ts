/**
 * Trace of action execution.
 */
export interface ActionTrace {
  /** Type of the action executed */
  readonly actionType: string;
  /** Whether the action succeeded */
  readonly success: boolean;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Error message if failed */
  readonly error?: string;
}
