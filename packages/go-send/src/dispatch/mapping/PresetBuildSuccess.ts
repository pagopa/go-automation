import type { PresetRow } from './PresetRow.js';

/**
 * Valid outcome of `buildPreset`.
 */
export interface PresetBuildSuccess {
  readonly ok: true;
  readonly preset: PresetRow;
}
