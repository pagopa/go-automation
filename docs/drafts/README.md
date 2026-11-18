# Bozze

Le bozze raccolgono appunti su lavori da fare o che piacerebbe fare, quando non si possono ancora sviluppare: manca un
prerequisito, una decisione o un approfondimento. Non sono specifiche: non si rivedono, non si approvano e non si
implementano. Quando una bozza matura, diventa una specifica in `docs/specs/` (vedi
[docs/specs/README.md](../specs/README.md)) e la bozza resta come origine.

## Struttura

Stesso schema delle specifiche, con il prefisso `DRAFT`:

```
docs/drafts/
└── DRAFT-001-ExecuteRunbookRemoval/
    ├── DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md
    └── DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v02.md
```

- **Nome**: `DRAFT-<NNN>-<Argomento>`, con il numero a tre cifre progressivo e l'argomento in PascalCase. La
  numerazione è indipendente da quella delle specifiche.
- **File di una versione**: `DRAFT-<NNN>-<Argomento>-<AUTORE>-v<NN>.md`, come per le specifiche.
- **Una versione nuova è un file nuovo** nella stessa cartella; le versioni precedenti non si modificano.
- **Niente registro delle revisioni**: una bozza non passa da revisione e approvazione. Il registro nasce con la
  specifica.

## Forma di una versione

L'intestazione dice lo stato, l'autore, la data e l'origine degli appunti. Gli stati possibili sono tre:

- **aperta**: la bozza raccoglie appunti;
- **promossa**: è diventata una specifica, indicata nell'intestazione;
- **abbandonata**: non si fa, e il motivo sta nell'intestazione.

Le sezioni seguono, dove servono, quest'ordine:

1. **Perché**: l'idea e il problema che risolverebbe.
2. **Che cosa sappiamo**: i fatti verificati, con la data della verifica.
3. **L'idea**: che cosa si farebbe, per argomento.
4. **Che cosa manca per farla**: i prerequisiti che la rendono implementabile.
5. **Domande aperte**: numerate `Q1`, `Q2`, …, da sciogliere prima di scrivere la specifica.

## Regole

- Valgono le regole delle specifiche: le bozze si citano solo nei documenti di `docs/`, mai nel codice, nei commenti,
  nei test, nei workflow, nei changeset o nei messaggi di commit.
- Una bozza non contiene segreti, account id AWS reali o nomi di profilo.
- I fatti invecchiano: prima di promuovere una bozza a specifica, si verificano di nuovo.
