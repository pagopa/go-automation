interface ScriptCategoryDefinition {
  readonly value: string;
  readonly menuLabel: string;
  readonly scaffoldTitle: string;
  readonly productCode: string;
}

interface ScriptCategoryChoice {
  readonly title: string;
  readonly value: string;
}

const SCRIPT_CATEGORY_DEFINITIONS: ReadonlyArray<ScriptCategoryDefinition> = [
  {
    value: 'go',
    menuLabel: '[GO] Team Gestione Operativa',
    scaffoldTitle: 'GO (Internal)',
    productCode: 'GO',
  },
  {
    value: 'send',
    menuLabel: '[SEND] SErvizio Notifiche Digitali',
    scaffoldTitle: 'SEND (Product)',
    productCode: 'SEND',
  },
  {
    value: 'interop',
    menuLabel: '[INTEROP] PDND Interoperabilità',
    scaffoldTitle: 'Interop (Interoperability)',
    productCode: 'INTEROP',
  },
  {
    value: 'aws',
    menuLabel: '[AWS] Amazon Web Services',
    scaffoldTitle: 'AWS (Amazon Web Services)',
    productCode: 'AWS',
  },
];

function findCategoryDefinition(category: string): ScriptCategoryDefinition | undefined {
  return SCRIPT_CATEGORY_DEFINITIONS.find((definition) => definition.value === category);
}

export function getCategoryMenuLabel(category: string): string {
  return findCategoryDefinition(category)?.menuLabel ?? category.toUpperCase();
}

export function getScaffoldCategoryChoices(): ScriptCategoryChoice[] {
  return SCRIPT_CATEGORY_DEFINITIONS.map((definition) => ({
    title: definition.scaffoldTitle,
    value: definition.value,
  }));
}

export function getScriptShortcutBase(scriptName: string, category: string): string {
  const categoryPrefix = `${category}-`;
  const baseName = scriptName.startsWith(categoryPrefix) ? scriptName.slice(categoryPrefix.length) : scriptName;

  return `${category}:${baseName.replace(/-/g, ':')}`;
}
