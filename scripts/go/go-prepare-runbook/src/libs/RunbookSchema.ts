import { z } from 'zod';

/**
 * Schema di validazione per i metadati (YAML Frontmatter) del Runbook.
 */
export const RunbookFrontmatterSchema = z.object({
  /** Titolo della pagina Confluence */
  title: z.string({
    required_error: "Il campo 'title' è obbligatorio nel frontmatter.",
    invalid_type_error: "Il campo 'title' deve essere una stringa.",
  }),

  /** Key dello spazio Confluence */
  spaceKey: z.string({
    required_error: "Il campo 'spaceKey' è obbligatorio nel frontmatter.",
  }),

  /** ID della pagina o cartella parente in Confluence */
  parentId: z.string({
    required_error: "Il campo 'parentId' è obbligatorio nel frontmatter.",
  }),

  /** ID del runbook (opzionale, default generato da titolo se mancante) */
  id: z.string().optional(),

  /** Versione del runbook (opzionale, default 1.0.0) */
  version: z.string().default('1.0.0'),

  /** Team proprietario (opzionale) */
  team: z.string().default('Team GO'),

  /** Tags per categorizzazione (opzionale) */
  tags: z.array(z.string()).default([]),

  /** Riferimenti ad asset condivisi (opzionale) */
  assets: z.array(z.string()).optional().default([]),
});

/**
 * Tipo inferito dallo schema di frontmatter
 */
export type RunbookFrontmatter = z.infer<typeof RunbookFrontmatterSchema>;

/**
 * Payload finale garantito
 */
export const RunbookPayloadSchema = z.object({
  metadata: RunbookFrontmatterSchema,
  markdownBody: z.string(),
});

export type RunbookPayload = z.infer<typeof RunbookPayloadSchema>;
