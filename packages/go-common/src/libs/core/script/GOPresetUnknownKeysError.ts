export interface GOPresetUnknownKeysErrorOptions {
  readonly presetName: string;
  readonly unknownKeys: ReadonlyArray<string>;
  readonly knownKeys: ReadonlyArray<string>;
  readonly suggestions: Readonly<Record<string, string>>;
}

export class GOPresetUnknownKeysError extends Error {
  readonly presetName: string;
  readonly unknownKeys: ReadonlyArray<string>;
  readonly knownKeys: ReadonlyArray<string>;
  readonly suggestions: Readonly<Record<string, string>>;

  constructor(options: GOPresetUnknownKeysErrorOptions) {
    super(formatPresetUnknownKeysMessage(options.presetName, options.unknownKeys, options.suggestions));
    this.name = 'GOPresetUnknownKeysError';
    this.presetName = options.presetName;
    this.unknownKeys = Object.freeze([...options.unknownKeys]);
    this.knownKeys = Object.freeze([...options.knownKeys]);
    this.suggestions = freezeSuggestions(options.suggestions);
  }
}

function freezeSuggestions(suggestions: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const copy = Object.create(null) as Record<string, string>;

  for (const [key, value] of Object.entries(suggestions)) {
    copy[key] = value;
  }

  return Object.freeze(copy);
}

function formatPresetUnknownKeysMessage(
  presetName: string,
  unknownKeys: ReadonlyArray<string>,
  suggestions: Readonly<Record<string, string>>,
): string {
  if (unknownKeys.length === 1) {
    const key = unknownKeys[0] ?? '';
    const suggestion = suggestions[key];
    return suggestion === undefined
      ? `Preset "${presetName}" contains unknown key "${key}"`
      : `Preset "${presetName}" contains unknown key "${key}". Did you mean "${suggestion}"?`;
  }

  const lines = [`Preset "${presetName}" contains ${String(unknownKeys.length)} unknown key(s):`];
  for (const key of unknownKeys) {
    const suggestion = suggestions[key];
    lines.push(suggestion === undefined ? `  - ${key}` : `  - ${key} (did you mean "${suggestion}"?)`);
  }
  return lines.join('\n');
}
