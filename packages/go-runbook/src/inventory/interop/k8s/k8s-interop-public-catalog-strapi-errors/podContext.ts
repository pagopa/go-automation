import type { interop } from '../../../../toolkits/interop/index.js';

/** Read startup and request context even when Strapi does not emit a CID. */
export const POD_CONTEXT: interop.k8s.QueryInteropPodContextConfig = {
  id: 'query-public-catalog-strapi-context',
  label: 'Contesto completo Strapi del catalogo pubblico',
  contextName: 'Public catalog Strapi context',
  countVar: 'publicCatalogStrapiContextLogCount',
  namespaceSuffix: '-public-catalog',
  completeness: 'row-limit-or-unreturned-matches',
  missingContextError: 'Missing resolved INTEROP public catalog Strapi context',
  incompleteContextError: 'Strapi context is incomplete; narrow the interval or pod stream',
};
