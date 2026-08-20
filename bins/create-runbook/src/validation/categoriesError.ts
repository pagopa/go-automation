const CATEGORY_PATTERN = /^[A-Z][A-Z0-9_]*$/u;

/**
 * Validates automatic catalog categories using the Watchtower contract rules.
 *
 * @param categories - Parsed category values
 * @returns An error message, or `undefined` when valid
 */
export function categoriesError(categories: ReadonlyArray<string>): string | undefined {
  if (categories.length === 0) {
    return 'È necessaria almeno una categoria.';
  }
  const invalid = categories.find((category) => !CATEGORY_PATTERN.test(category));
  if (invalid !== undefined) {
    return `Categoria non valida: "${invalid}". Usa lettere maiuscole, numeri e underscore.`;
  }
  if (new Set(categories).size !== categories.length) {
    return 'Le categorie non possono contenere duplicati.';
  }
  return undefined;
}
