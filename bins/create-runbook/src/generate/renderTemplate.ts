/**
 * Replaces every `{{TOKEN}}` occurrence in `content` with its mapped value.
 *
 * Unknown tokens are left untouched so that template typos surface during
 * review rather than silently disappearing.
 *
 * @param content - Raw template text
 * @param tokens - Token → replacement map
 * @returns The rendered text
 */
export function renderTemplate(content: string, tokens: ReadonlyMap<string, string>): string {
  return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match: string, token: string): string => {
    const value = tokens.get(token);
    return value ?? match /* unknown token: return original */;
  });
}
