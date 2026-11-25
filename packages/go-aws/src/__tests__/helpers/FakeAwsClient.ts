/** Computes the reply to one command: a response, or an `Error` to throw. */
export type FakeAwsResponderFn = (command: object, callIndex: number) => unknown;

/** A command class, used to filter the recorded commands by type. */
type CommandClass<T extends object> = abstract new (...args: never[]) => T;

/**
 * Test double of an AWS SDK v3 client: records every command (and its send
 * options) and answers with scripted replies.
 *
 * Replies are either a list consumed in order (running out is a test error) or
 * a function of the command; a reply that is an `Error` is thrown.
 */
export class FakeAwsClient {
  public readonly commands: object[] = [];
  public readonly sendOptions: unknown[] = [];
  private readonly responder: FakeAwsResponderFn;

  constructor(replies: FakeAwsResponderFn | ReadonlyArray<unknown> = []) {
    if (typeof replies === 'function') {
      this.responder = replies;
    } else {
      const queue = [...replies];
      this.responder = (command): unknown =>
        queue.length > 0 ? queue.shift() : new Error(`Unexpected command: ${command.constructor.name}`);
    }
  }

  public async send(command: object, options?: unknown): Promise<unknown> {
    this.commands.push(command);
    this.sendOptions.push(options);
    await Promise.resolve();
    const reply = this.responder(command, this.commands.length - 1);
    if (reply instanceof Error) throw reply;
    return reply;
  }

  /**
   * The double typed as the SDK client a service expects.
   *
   * @returns This client, cast to `T`
   */
  public as<T>(): T {
    return this as unknown as T;
  }

  /**
   * Recorded commands of one type, in send order.
   *
   * @param type - Command class
   * @returns The matching commands
   */
  public sent<T extends object>(type: CommandClass<T>): T[] {
    return this.commands.filter((command): command is T => command instanceof type);
  }

  /**
   * Inputs of the recorded commands of one type, in send order.
   *
   * @param type - Command class
   * @returns The `input` of each matching command
   */
  public inputs(type: CommandClass<{ readonly input: object }>): ReadonlyArray<Record<string, unknown>> {
    return this.sent(type).map((command) => command.input as Record<string, unknown>);
  }
}
