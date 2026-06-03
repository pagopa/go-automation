import * as prettier from 'prettier';

/**
 * Formats TypeScript source with the repository Prettier configuration.
 *
 * Formatting failures are non-fatal: the original content is returned so a
 * Prettier hiccup never blocks scaffolding (the templates are already
 * well-formatted).
 *
 * @param content - Source text to format
 * @param filepath - Target file path (used to infer parser and resolve config)
 * @returns The formatted source, or the original content on failure
 */
export async function formatTypeScript(content: string, filepath: string): Promise<string> {
  try {
    const config = await prettier.resolveConfig(filepath);
    return await prettier.format(content, { ...config, filepath });
  } catch {
    return content;
  }
}
