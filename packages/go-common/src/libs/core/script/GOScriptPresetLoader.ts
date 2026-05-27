import fs from 'fs';
import path from 'path';

import { GOConfigObjectFlattener } from '../config/GOConfigObjectFlattener.js';
import type { GOFlattenedConfigValue } from '../config/GOConfigObjectFlattener.js';
import type { GOConfigSchema } from '../config/GOConfigSchema.js';
import { GOYAMLParser } from '../config/parsers/GOYAMLParser.js';
import { damerauLevenshteinDistance } from '../config/validation/GOStringDistance.js';
import { getErrorMessage } from '../errors/GOErrorUtils.js';
import { GOPathType, type GOPaths } from '../utils/GOPaths.js';

export interface GOScriptPresetDefinition {
  readonly name: string;
  readonly description?: string;
  readonly allowUnknownKeys?: boolean;
  readonly values: Record<string, unknown>;
}

export interface GOScriptPresetFile {
  readonly version?: number;
  readonly allowUnknownKeys?: boolean;
  readonly presets: ReadonlyArray<GOScriptPresetDefinition>;
}

export interface GOScriptPresetResolution {
  readonly name: string;
  readonly sourcePath: string;
  readonly sourceDisplayPath: string;
  readonly values: ReadonlyMap<string, GOFlattenedConfigValue>;
  readonly unknownKeys: ReadonlyArray<string>;
  readonly allowUnknownKeys: boolean;
}

export interface GOScriptPresetLoaderOptions {
  readonly presetName: string;
  readonly presetFile?: string;
  readonly paths: GOPaths;
  readonly schema: GOConfigSchema;
}

interface ResolvedPresetFile {
  readonly path: string;
  readonly displayPath: string;
}

const DEFAULT_PRESET_FILE_NAMES = ['presets.yaml', 'presets.yml', 'presets.json'] as const;
const SUPPORTED_PRESET_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_ALLOW_UNKNOWN_KEYS = true;
const MAX_SUGGESTION_DISTANCE = 3;

export class GOScriptPresetLoader {
  loadSelectedPreset(options: GOScriptPresetLoaderOptions): GOScriptPresetResolution {
    const presetName = this.normalizePresetName(options.presetName);
    const resolvedFile = this.resolvePresetFile({
      presetName,
      ...(options.presetFile !== undefined ? { presetFile: options.presetFile } : {}),
      paths: options.paths,
    });
    const parsed = this.parsePresetFile(resolvedFile.path);
    const presetFile = this.normalizePresetFile(parsed, resolvedFile.displayPath);
    const preset = this.selectPreset(presetFile.presets, presetName, resolvedFile.displayPath);
    const allowUnknownKeys = preset.allowUnknownKeys ?? presetFile.allowUnknownKeys ?? DEFAULT_ALLOW_UNKNOWN_KEYS;
    const values = GOConfigObjectFlattener.flatten(preset.values);
    const unknownKeys = this.findUnknownKeys(values, options.schema);

    if (unknownKeys.length > 0 && !allowUnknownKeys) {
      throw new Error(this.formatUnknownKeysError(presetName, unknownKeys, options.schema));
    }

    return {
      name: preset.name,
      sourcePath: resolvedFile.path,
      sourceDisplayPath: resolvedFile.displayPath,
      values,
      unknownKeys,
      allowUnknownKeys,
    };
  }

  private normalizePresetName(rawName: string): string {
    const presetName = rawName.trim();

    if (presetName.length === 0) {
      throw new Error('script.preset.name cannot be empty');
    }

    if (presetName.includes(',')) {
      throw new Error(`Multiple script presets are not supported in v1: ${presetName}`);
    }

    return presetName;
  }

  private resolvePresetFile(options: {
    readonly presetName: string;
    readonly presetFile?: string;
    readonly paths: GOPaths;
  }): ResolvedPresetFile {
    const presetFile = options.presetFile?.trim();

    if (presetFile?.length === 0) {
      throw new Error('script.preset.file cannot be empty when script.preset.name is configured');
    }

    if (presetFile !== undefined) {
      this.validatePresetFileExtension(presetFile);
      const resolvedPath = this.resolveCustomPresetFile(presetFile, options.paths);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Preset "${options.presetName}" requested but preset file "${presetFile}" was not found.`);
      }

      return {
        path: this.validatePresetFilePath(resolvedPath, presetFile, options.paths),
        displayPath: presetFile,
      };
    }

    for (const fileName of DEFAULT_PRESET_FILE_NAMES) {
      const result = options.paths.getConfigFilePathWithInfo(fileName);
      if (result.source !== 'none') {
        return {
          path: this.validatePresetFilePath(result.path, fileName, options.paths),
          displayPath: fileName,
        };
      }
    }

    throw new Error(
      `Preset "${options.presetName}" requested but presets file was not found.\nChecked: ${DEFAULT_PRESET_FILE_NAMES.join(', ')}`,
    );
  }

  private resolveCustomPresetFile(presetFile: string, paths: GOPaths): string {
    if (path.isAbsolute(presetFile)) {
      return presetFile;
    }

    if (this.hasPathSegment(presetFile)) {
      return path.resolve(process.cwd(), presetFile);
    }

    return paths.resolvePath(presetFile, GOPathType.CONFIG);
  }

  private validatePresetFilePath(filePath: string, displayPath: string, paths: GOPaths): string {
    const realFilePath = fs.realpathSync(filePath);
    const allowedRoots = this.getAllowedPresetRoots(paths);
    const isAllowed = allowedRoots.some((root) => this.isPathInsideRoot(realFilePath, root));

    if (!isAllowed) {
      throw new Error(
        `Preset file "${displayPath}" must be inside an allowed config directory: ${allowedRoots.join(', ')}`,
      );
    }

    return realFilePath;
  }

  private getAllowedPresetRoots(paths: GOPaths): ReadonlyArray<string> {
    return [paths.getDataConfigDir(), paths.getLocalConfigsDir()].map((root) => this.realpathOrResolve(root));
  }

  private realpathOrResolve(rootPath: string): string {
    return fs.existsSync(rootPath) ? fs.realpathSync(rootPath) : path.resolve(rootPath);
  }

  private isPathInsideRoot(filePath: string, rootPath: string): boolean {
    const relativePath = path.relative(rootPath, filePath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
  }

  private hasPathSegment(presetFile: string): boolean {
    return presetFile.startsWith('.') || presetFile.includes('/') || presetFile.includes('\\');
  }

  private validatePresetFileExtension(filePath: string): void {
    const extension = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_PRESET_EXTENSIONS.has(extension)) {
      throw new Error(
        `Unsupported presets file extension "${extension || '(none)'}". Supported extensions: .yaml, .yml, .json`,
      );
    }
  }

  private parsePresetFile(filePath: string): unknown {
    this.validatePresetFileExtension(filePath);
    const extension = path.extname(filePath).toLowerCase();

    try {
      if (extension === '.json') {
        const content = fs.readFileSync(filePath, 'utf8');
        const normalizedContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
        return JSON.parse(normalizedContent) as unknown;
      }

      return GOYAMLParser.parseFile(filePath);
    } catch (error: unknown) {
      throw new Error(`Failed to load presets file ${filePath}: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  private normalizePresetFile(parsed: unknown, sourcePath: string): GOScriptPresetFile {
    if (Array.isArray(parsed)) {
      return {
        allowUnknownKeys: DEFAULT_ALLOW_UNKNOWN_KEYS,
        presets: this.normalizePresetArray(parsed, sourcePath),
      };
    }

    if (!this.isRecord(parsed)) {
      throw new Error(`Invalid presets file ${sourcePath}. Expected a JSON/YAML object or array.`);
    }

    this.assertNoDangerousKeys(parsed, sourcePath);

    const rawPresets = parsed['presets'];
    if (rawPresets !== undefined) {
      const allowUnknownKeys = this.readOptionalBoolean(parsed['allowUnknownKeys'], `${sourcePath}.allowUnknownKeys`);
      return {
        ...(allowUnknownKeys !== undefined ? { allowUnknownKeys } : {}),
        presets: this.normalizePresetArray(rawPresets, sourcePath),
      };
    }

    return {
      allowUnknownKeys: DEFAULT_ALLOW_UNKNOWN_KEYS,
      presets: this.normalizeTopLevelMap(parsed, sourcePath),
    };
  }

  private normalizePresetArray(rawPresets: unknown, sourcePath: string): ReadonlyArray<GOScriptPresetDefinition> {
    if (!Array.isArray(rawPresets)) {
      throw new Error(`Invalid presets file ${sourcePath}. Expected "presets" to be an array.`);
    }

    const presets: GOScriptPresetDefinition[] = [];
    const names = new Set<string>();

    rawPresets.forEach((entry, index) => {
      const label = `presets[${String(index)}]`;
      if (!this.isRecord(entry)) {
        throw new Error(`Invalid preset definition ${label} in ${sourcePath}. Expected an object.`);
      }

      this.assertNoDangerousKeys(entry, `${sourcePath}.${label}`);

      const name = this.readRequiredString(entry['name'], `${label}.name`, sourcePath);
      if (names.has(name)) {
        throw new Error(`Duplicate preset name "${name}" in ${sourcePath}`);
      }
      names.add(name);

      const rawValues = entry['values'];
      if (!this.isRecord(rawValues)) {
        throw new Error(`Preset "${name}" in ${sourcePath} must contain an object values field`);
      }

      const allowUnknownKeys = this.readOptionalBoolean(entry['allowUnknownKeys'], `${label}.allowUnknownKeys`);
      const description = this.readOptionalString(entry['description'], `${label}.description`);

      presets.push({
        name,
        ...(description !== undefined ? { description } : {}),
        ...(allowUnknownKeys !== undefined ? { allowUnknownKeys } : {}),
        values: rawValues,
      });
    });

    return presets;
  }

  private normalizeTopLevelMap(
    data: Record<string, unknown>,
    sourcePath: string,
  ): ReadonlyArray<GOScriptPresetDefinition> {
    const presets: GOScriptPresetDefinition[] = [];

    for (const [name, values] of Object.entries(data)) {
      this.assertSafeKey(name, sourcePath);

      const normalizedName = name.trim();
      if (normalizedName.length === 0) {
        throw new Error(`Invalid preset name in ${sourcePath}. Preset name cannot be empty.`);
      }

      if (!this.isRecord(values)) {
        throw new Error(`Preset "${normalizedName}" in ${sourcePath} must be an object`);
      }

      presets.push({
        name: normalizedName,
        values,
      });
    }

    return presets;
  }

  private selectPreset(
    presets: ReadonlyArray<GOScriptPresetDefinition>,
    presetName: string,
    sourcePath: string,
  ): GOScriptPresetDefinition {
    const preset = presets.find((candidate) => candidate.name === presetName);
    if (preset !== undefined) {
      return preset;
    }

    const available = presets
      .map((candidate) => candidate.name)
      .sort()
      .join(', ');
    throw new Error(`Preset "${presetName}" not found in ${sourcePath}. Available presets: ${available || '(none)'}`);
  }

  private findUnknownKeys(
    values: ReadonlyMap<string, GOFlattenedConfigValue>,
    schema: GOConfigSchema,
  ): ReadonlyArray<string> {
    const knownKeys = this.buildKnownConfigKeys(schema);
    return Array.from(values.keys()).filter((key) => !knownKeys.has(key));
  }

  private buildKnownConfigKeys(schema: GOConfigSchema): Set<string> {
    const keys = new Set<string>();

    for (const parameter of schema.getAllParameters()) {
      keys.add(parameter.name);
      for (const alias of parameter.aliases) {
        keys.add(alias);
      }
    }

    return keys;
  }

  private formatUnknownKeysError(
    presetName: string,
    unknownKeys: ReadonlyArray<string>,
    schema: GOConfigSchema,
  ): string {
    const knownKeys = Array.from(this.buildKnownConfigKeys(schema));

    if (unknownKeys.length === 1) {
      const key = unknownKeys[0] ?? '';
      const suggestion = this.findClosestKnownKey(key, knownKeys);
      return suggestion === undefined
        ? `Preset "${presetName}" contains unknown key "${key}"`
        : `Preset "${presetName}" contains unknown key "${key}". Did you mean "${suggestion}"?`;
    }

    const lines = [`Preset "${presetName}" contains ${String(unknownKeys.length)} unknown key(s):`];
    for (const key of unknownKeys) {
      const suggestion = this.findClosestKnownKey(key, knownKeys);
      lines.push(suggestion === undefined ? `  - ${key}` : `  - ${key} (did you mean "${suggestion}"?)`);
    }
    return lines.join('\n');
  }

  private findClosestKnownKey(unknownKey: string, knownKeys: ReadonlyArray<string>): string | undefined {
    let bestKey: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const knownKey of knownKeys) {
      const distance = damerauLevenshteinDistance(unknownKey, knownKey);
      if (distance <= MAX_SUGGESTION_DISTANCE && distance < bestDistance) {
        bestKey = knownKey;
        bestDistance = distance;
      }
    }

    return bestKey;
  }

  private readRequiredString(value: unknown, label: string, sourcePath: string): string {
    if (typeof value !== 'string') {
      throw new Error(`Invalid ${label} in ${sourcePath}. Expected a non-empty string.`);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(`Invalid ${label} in ${sourcePath}. Expected a non-empty string.`);
    }

    this.assertSafeKey(trimmed, sourcePath);
    return trimmed;
  }

  private readOptionalString(value: unknown, label: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new Error(`Invalid ${label}. Expected a string.`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readOptionalBoolean(value: unknown, label: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'boolean') {
      throw new Error(`Invalid ${label}. Expected a boolean.`);
    }
    return value;
  }

  private assertNoDangerousKeys(data: Record<string, unknown>, location: string): void {
    for (const [key, value] of Object.entries(data)) {
      this.assertSafeKey(key, location);

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (this.isRecord(item)) {
            this.assertNoDangerousKeys(item, `${location}.${key}[${String(index)}]`);
          }
        });
        continue;
      }

      if (this.isRecord(value)) {
        this.assertNoDangerousKeys(value, `${location}.${key}`);
      }
    }
  }

  private assertSafeKey(key: string, location: string): void {
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error(`Unsafe preset key "${location}.${key}" is not allowed`);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
