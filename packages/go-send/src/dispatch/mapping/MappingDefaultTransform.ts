/**
 * Fill transform `default`: sets `value` when the field is still empty after
 * merging row, CLI and environment values. A profile default therefore never
 * overrides `--defaults` or the environment `defaults`.
 */
export interface MappingDefaultTransform {
  readonly op: 'default';
  readonly value: string;
}
