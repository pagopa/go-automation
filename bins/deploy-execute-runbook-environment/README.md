# Deploy dell’ambiente runbook

Il comando `pnpm deploy:execute-runbook:environment` legge i file regionali `<regione>.env` da `--config-dir`.
Prima del deploy verifica che `WATCHTOWER_INTERNAL_URL` coincida con il backend Watchtower di produzione censito nel repository.
La verifica precede il recupero del segreto del service principal e le richieste di autenticazione.

Per un backend diverso, indicare esplicitamente la destinazione sulla riga di comando:

```sh
pnpm deploy:execute-runbook:environment \
  --environment dev \
  --regions eu-south-1 \
  --config-dir ./deploy/dev \
  --watchtower-url https://watchtower.example.test/bff
```

L’URL passato con `--watchtower-url` deve coincidere con quello nei file regionali.
L’opzione va scelta dall’operatore, senza ricavarla automaticamente dagli stessi file `.env`.
Sono accettati solo URL HTTPS senza credenziali, query o frammenti; il suffisso `/api` e gli slash finali sono normalizzati.
Login e polling rifiutano i redirect, per evitare l’invio della password o del token a un’altra destinazione.
