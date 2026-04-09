/**
 * GO-AI prompt loader
 * Loads hat templates from prompts.yaml at runtime.
 * YAML lives at packages/go-ai/prompts.yaml — one level above src/.
 */

import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

import { Core } from '@go-automation/go-common';

import type { GOAIHat } from '../types/index.js';

interface PromptEntry {
  readonly description: string;
  readonly template: string;
}

type PromptsFile = Partial<Record<string, PromptEntry>>;

function loadPromptsFile(yamlPath?: string): PromptsFile {
  // Default: prompts.yaml sits at the package root (one level above src/)
  const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../prompts.yaml');

  const resolvedPath = yamlPath ?? process.env['GO_AI_PROMPTS_PATH'] ?? defaultPath;
  return Core.GOYAMLParser.parseFile(resolvedPath) as PromptsFile;
}

// Loaded once at module init
const prompts = loadPromptsFile();

export function getTemplate(hat: GOAIHat): string {
  const entry = prompts[hat];
  if (!entry?.template) {
    const available = Object.keys(prompts).join(', ');
    throw new Error(`Unknown hat: '${hat}'. Available: ${available}`);
  }
  return entry.template;
}

export function listHatsFromYaml(): string[] {
  return Object.keys(prompts);
}
