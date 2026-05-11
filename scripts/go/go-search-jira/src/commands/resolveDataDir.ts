/**
 * Resolves the cache/index directory using `GOPaths` so the script honours the
 * monorepo conventions (writes under `<root>/data/<script>` in monorepo mode,
 * or under the script base dir when used standalone).
 */
import { Core } from '@go-automation/go-common';

export function resolveDataDir(script: Core.GOScript, configValue: string): string {
  if (configValue.length > 0) {
    const resolved = script.paths.resolvePathWithInfo(configValue, Core.GOPathType.OUTPUT);
    return resolved.path;
  }
  return script.paths.getDataDir();
}
