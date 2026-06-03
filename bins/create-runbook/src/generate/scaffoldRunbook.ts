import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { RunbookTemplate } from '../templates/RunbookTemplate.js';
import type { RunbookAnswers } from '../templates/RunbookAnswers.js';
import { renderTemplate } from './renderTemplate.js';
import { formatTypeScript } from './formatTypeScript.js';

/** A file produced by the scaffolder, with its absolute path and content. */
export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Renders and formats every file of a template for the given answers.
 * Reads the template files but writes nothing.
 *
 * @param template - The selected template
 * @param answers - Resolved scaffold answers
 * @param templatesRoot - Root dir holding the template folders
 * @param targetDir - Destination runbook directory (absolute)
 * @returns The list of files to write
 */
export async function renderRunbookFiles(
  template: RunbookTemplate,
  answers: RunbookAnswers,
  templatesRoot: string,
  targetDir: string,
): Promise<ReadonlyArray<GeneratedFile>> {
  const tokens = template.buildPlaceholders(answers);

  const files: GeneratedFile[] = [];
  for (const file of template.files) {
    const templatePath = path.join(templatesRoot, template.templateDir, file.template);
    const raw = await fs.readFile(templatePath, 'utf8');
    const outputPath = path.join(targetDir, file.output);
    const content = await formatTypeScript(renderTemplate(raw, tokens), outputPath);
    files.push({ path: outputPath, content });
  }
  return files;
}

/**
 * Writes generated files to disk, creating parent directories as needed.
 *
 * @param files - Files to write
 */
export async function writeGeneratedFiles(files: ReadonlyArray<GeneratedFile>): Promise<void> {
  for (const file of files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    await fs.writeFile(file.path, file.content, 'utf8');
  }
}
