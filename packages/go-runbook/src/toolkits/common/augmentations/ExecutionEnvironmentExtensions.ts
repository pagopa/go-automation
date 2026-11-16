declare module '../../../engine/tracing/ExecutionEnvironmentExtensions.js' {
  /** AWS fields of an execution environment, optional: an engine-only execution has none. */
  interface ExecutionEnvironmentExtensions {
    /** AWS profiles used */
    readonly awsProfiles?: ReadonlyArray<string>;
    /** AWS region */
    readonly region?: string;
    /** Account of the alarm, when the execution is bound to one */
    readonly awsAccountId?: string;
  }
}

/** Marker that loads the AWS fields of `ExecutionEnvironment`. */
export type ExecutionEnvironmentExtensionsAugmentation = 'executionEnvironment';
