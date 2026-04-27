import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Core } from '@go-automation/go-common';
import { getCategoryProductCode, getScaffoldCategoryChoices, getScriptShortcutBase } from './categories.js';

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
const ROOT_DIR = path.resolve(dirName, '../../..');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'bins/script-templates');

interface ScaffoldOptions {
  name: string; // e.g. go-my-new-script
  category: string; // e.g. go, send, interop, aws
  description: string;
  author: string;
  product: string; // e.g. GO, SEND, INTEROP, AWS
}

interface PackageJson {
  name: string;
  version: string;
  scripts: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Script Scaffolder - Generates new scripts from templates
 */
export class Scaffolder {
  private readonly prompt: Core.GOPrompt;
  private readonly logger: Core.GOLogger;

  constructor(prompt: Core.GOPrompt, logger: Core.GOLogger) {
    this.prompt = prompt;
    this.logger = logger;
  }

  /**
   * Run the scaffolding wizard
   */
  public async run(): Promise<void> {
    this.logger.newline();
    this.logger.section('Create New GO Automation Script');

    const name = await this.prompt.text('Script Name (kebab-case, e.g. go-analyze-data):', {
      validate: (val) => /^[a-z0-9-]+$/.test(val) || 'Name must be kebab-case',
    });
    if (!name) return;

    const category = await this.prompt.select<string>('Category:', getScaffoldCategoryChoices());
    if (!category) return;

    const categoryStr = category;
    const description = await this.prompt.text('Description:');
    if (description === undefined) return;

    const author = await this.prompt.text('Author:', { initial: 'Team GO - Gestione Operativa' });
    if (author === undefined) return;

    const product = getCategoryProductCode(categoryStr);

    const options: ScaffoldOptions = {
      name,
      category: categoryStr,
      description,
      author,
      product,
    };

    await this.scaffold(options);
  }

  /**
   * Generate the script files
   */
  private async scaffold(options: ScaffoldOptions): Promise<void> {
    const targetDir = path.join(ROOT_DIR, 'scripts', options.category, options.name);

    if (
      await fs
        .access(targetDir)
        .then(() => true)
        .catch(() => false)
    ) {
      this.logger.error(`Directory already exists: ${targetDir}`);
      return;
    }

    this.logger.info(`Generating script in ${targetDir}...`);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(path.join(targetDir, 'src/types'), { recursive: true });

    // 1. Map templates to target files
    const fileMap: Record<string, string> = {
      'package.json.template': 'package.json',
      'tsconfig.json.template': 'tsconfig.json',
      'README.md.template': 'README.md',
      'index.ts.template': 'src/index.ts',
      'config.ts.template': 'src/config.ts',
      'main.ts.template': 'src/main.ts',
      'config-type.ts.template': 'src/types/index.ts',
    };

    // 2. Prepare replacements
    const title = options.name
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');

    const configName = `${options.name
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')}Config`;

    const replacements: Record<string, string> = {
      '{{SCRIPT_NAME}}': options.name,
      '{{SCRIPT_TITLE}}': title,
      '{{SCRIPT_DESCRIPTION}}': options.description,
      '{{SCRIPT_AUTHOR}}': options.author,
      '{{PRODUCT}}': options.product,
      '{{SCRIPT_CONFIG_NAME}}': configName,
    };

    // 3. Process files
    for (const [template, target] of Object.entries(fileMap)) {
      const templatePath = path.join(TEMPLATES_DIR, template);
      let content = await fs.readFile(templatePath, 'utf-8');

      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.replaceAll(placeholder, value);
      }

      await fs.writeFile(path.join(targetDir, target), content);
    }

    // 4. Update root package.json
    await this.updateRootPackageJson(options);

    this.logger.newline();
    this.logger.success(`Script ${options.name} created successfully!`);
    this.logger.text('Run "pnpm install" to update the workspace.');
  }

  /**
   * Add shortcuts to root package.json
   */
  private async updateRootPackageJson(options: ScaffoldOptions): Promise<void> {
    const rootPkgPath = path.join(ROOT_DIR, 'package.json');
    const rootPkg = JSON.parse(await fs.readFile(rootPkgPath, 'utf-8')) as PackageJson;

    const shortcutBase = getScriptShortcutBase(options.name, options.category);

    rootPkg.scripts[`${shortcutBase}:build`] = `pnpm --filter=${options.name} build`;
    rootPkg.scripts[`${shortcutBase}:dev`] = `pnpm --filter=${options.name} dev`;
    rootPkg.scripts[`${shortcutBase}:prod`] = `pnpm --filter=${options.name} start`;

    // Sort scripts alphabetically
    const sortedScripts: Record<string, string> = {};
    Object.keys(rootPkg.scripts)
      .sort()
      .forEach((key) => {
        const val = rootPkg.scripts[key];
        if (val) {
          sortedScripts[key] = val;
        }
      });
    rootPkg.scripts = sortedScripts;

    await fs.writeFile(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
  }
}
