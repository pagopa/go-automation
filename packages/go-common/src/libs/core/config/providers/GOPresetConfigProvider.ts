import { GOConfigProviderBase } from '../GOConfigProvider.js';
import type { GOConfigProvider } from '../GOConfigProvider.js';
import type { GOConfigSchema } from '../GOConfigSchema.js';
import { GOConfigTypeConverter } from '../GOConfigTypeConverter.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../GOSecretsSpecifier.js';

export interface GOPresetConfigProviderSelection {
  readonly presetName: string;
  readonly presetFile?: string;
}

export interface GOPresetConfigProviderResolution {
  readonly name: string;
  readonly sourcePath: string;
  readonly sourceDisplayPath: string;
  readonly values: ReadonlyMap<string, string | string[]>;
  readonly unknownKeys: ReadonlyArray<string>;
  readonly allowUnknownKeys: boolean;
}

type GOPresetConfigLoaderFn = (selection: GOPresetConfigProviderSelection) => GOPresetConfigProviderResolution;
type GOPresetConfigLogHandler = (message: string) => void;

export interface GOPresetConfigProviderOptions {
  readonly selectorProviders: ReadonlyArray<GOConfigProvider>;
  readonly presetNameParameter: string;
  readonly presetFileParameter: string;
  readonly schema: GOConfigSchema;
  readonly loadPreset: GOPresetConfigLoaderFn;
  readonly secretsSpecifier?: GOSecretsSpecifier;
  readonly onInfo?: GOPresetConfigLogHandler;
  readonly onWarning?: GOPresetConfigLogHandler;
}

export class GOPresetConfigProvider extends GOConfigProviderBase {
  protected values: Map<string, string | string[]> = new Map();
  private readonly secretRedactor: GOSecretRedactor;
  private readonly selectorProviders: ReadonlyArray<GOConfigProvider>;
  private readonly presetNameParameter: string;
  private readonly presetFileParameter: string;
  private readonly schema: GOConfigSchema;
  private readonly loadPreset: GOPresetConfigLoaderFn;
  private readonly onInfo: GOPresetConfigLogHandler | undefined;
  private readonly onWarning: GOPresetConfigLogHandler | undefined;
  private loaded = false;
  private presetName: string | undefined;

  constructor(options: GOPresetConfigProviderOptions) {
    super();
    this.selectorProviders = options.selectorProviders;
    this.presetNameParameter = options.presetNameParameter;
    this.presetFileParameter = options.presetFileParameter;
    this.schema = options.schema;
    this.loadPreset = options.loadPreset;
    this.secretRedactor = new GOSecretRedactor(options.secretsSpecifier ?? GOSecretsSpecifierFactory.none());
    this.onInfo = options.onInfo;
    this.onWarning = options.onWarning;
  }

  prepare(): void {
    this.reload();
  }

  getName(): string {
    return this.presetName === undefined ? 'Preset' : `Preset(${this.presetName})`;
  }

  override getValue(key: string): string | string[] | undefined {
    this.ensureLoaded();
    return super.getValue(key);
  }

  override hasKey(key: string): boolean {
    this.ensureLoaded();
    return super.hasKey(key);
  }

  override getAllKeys(): string[] {
    this.ensureLoaded();
    return super.getAllKeys();
  }

  isSecret(key: string): boolean {
    this.ensureLoaded();
    const value = this.values.get(key);
    if (value === undefined) return false;
    return this.secretRedactor.isSecret(key, value);
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      this.reload();
    }
  }

  private reload(): void {
    this.values = new Map();
    this.presetName = undefined;
    this.loaded = false;

    const presetName = this.readSelectorParameterAsString(this.presetNameParameter);
    const presetFile = this.readSelectorParameterAsString(this.presetFileParameter);

    if (presetName?.trim().length === 0) {
      throw new Error(`${this.presetNameParameter} cannot be empty`);
    }

    if (presetFile?.trim().length === 0) {
      throw new Error(`${this.presetFileParameter} cannot be empty`);
    }

    if (presetName === undefined) {
      if (presetFile !== undefined) {
        this.onWarning?.(
          `${this.presetFileParameter} is configured but ${this.presetNameParameter} is missing; preset file will be ignored.`,
        );
      }
      this.loaded = true;
      return;
    }

    const preset = this.loadPreset({
      presetName,
      ...(presetFile !== undefined ? { presetFile } : {}),
    });

    this.values = new Map(preset.values);
    this.presetName = preset.name;
    this.loaded = true;

    if (preset.unknownKeys.length > 0 && preset.allowUnknownKeys) {
      this.onWarning?.(
        `Preset "${preset.name}" contains ${preset.unknownKeys.length.toString()} unknown key(s): ${preset.unknownKeys.join(', ')}`,
      );
    }

    this.onInfo?.(
      `Loaded preset '${preset.name}' from ${preset.sourceDisplayPath} (${preset.values.size.toString()} keys)`,
    );
  }

  private readSelectorParameterAsString(parameterName: string): string | undefined {
    const parameter = this.schema.getParameter(parameterName);
    const keysToTry = parameter === undefined ? [parameterName] : [parameter.name, ...parameter.aliases];
    const rawValue = this.readRawSelectorValue(keysToTry);
    return rawValue === undefined ? undefined : GOConfigTypeConverter.toString(rawValue);
  }

  private readRawSelectorValue(keysToTry: ReadonlyArray<string>): string | string[] | undefined {
    for (const provider of this.selectorProviders) {
      for (const key of keysToTry) {
        if (provider.hasKey(key)) {
          return provider.getValue(key);
        }
      }
    }

    return undefined;
  }
}
