/**
 * Resolves the cache/index directory using `GOPaths` so the script honours the
 * monorepo conventions (writes under `<root>/data/<script>` in monorepo mode,
 * or under the script base dir when used standalone).
 */
import type { GOScript } from '@go-automation/go-script';
import { GOPathType } from '@pagopa/go-common/files';

export function resolveDataDir(script: GOScript, configValue: string): string {
  if (configValue.length > 0) {
    const resolved = script.paths.resolvePathWithInfo(configValue, GOPathType.OUTPUT);
    return resolved.path;
  }
  return script.paths.getDataDir();
}
