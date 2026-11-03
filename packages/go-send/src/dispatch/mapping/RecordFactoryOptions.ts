import type { FieldValues } from './FieldValues.js';
import type { MappingProfile } from './MappingProfile.js';
import type { RecordBuildContext } from './RecordBuildContext.js';
import type { RecordFactoryDirectOptions } from './RecordFactoryDirectOptions.js';

/**
 * Options of {@link ./RecordFactory.RecordFactory}.
 */
export interface RecordFactoryOptions {
  readonly profile: MappingProfile;
  /** Overrides from the command line (`--group-id`…): second precedence. */
  readonly cliValues: FieldValues;
  /** Values of the environment (`sender`, `groupId`, `defaults`): third precedence. */
  readonly environmentValues: FieldValues;
  readonly context: RecordBuildContext;
  /** Key column; overrides the profile one (`--row-key-column`). */
  readonly rowKeyColumn?: string;
  /** `direct` mode: run id and requestId template (§6.3). */
  readonly direct?: RecordFactoryDirectOptions;
}
