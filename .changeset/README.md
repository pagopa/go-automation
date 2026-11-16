# Changesets

Questa cartella contiene le **changeset**: piccoli file che descrivono una modifica ai package pubblicati (`@pagopa/*`) e il tipo di versione che richiede (patch, minor o major).

- Come aggiungerne una e come si fa un rilascio: [docs/RELEASING.md](../docs/RELEASING.md).
- Strumento: [Changesets](https://changesets.dev).

Non modificare a mano `pre.json` né la cartella `pre/`: li gestisce `pnpm changeset` dentro una PR di rilascio.
