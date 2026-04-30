# Safe-storage files upload

## Descrizione

Questo script è un wrapper dello script Bash **upload_file.sh** e viene utilizzato per eseguire il caricamento dei file su Safe-Storage.

## Coppie CX (client) - Tipo di documento

| CX                   | DOC_TYPE                    |
| :------------------- | :-------------------------- |
| pn-delivery          | PN_NOTIFICATION_ATTACHMENTS |
| pn-delivery-push     | PN_AAR, PN_LEGAL_FACTS      |
| pn-external-channels | PN_EXTERNAL_LEGAL_FACTS     |

## Utilizzo

### Help

```bash
# 1
./ss-client.sh

# 2
./ss-client.sh -h

# 3
 ./ss-client.sh --help
```

### Upload dei file

```bash
 ./ss-client.sh <CX> <DOC_TYPE> <path/to/files> <SSH_TUNNEL_LOCAL_PORT>
```

where:

- **CX**: è il nome del client;
- **DOC_TYPE**: è il tipo del documento ;
- **path/to/files**: path contenente i file da caricare;
- **SSH_TUNNEL_LOCAL_PORT**: porta locale configurata in fase di apertura tunnel verso l'opportuna istanza EC2.

### Esempio

```bash
 ./ss-client.sh pn-delivery PN_NOTIFICATION_ATTACHMENTS ./files/*.pdf 8888
```

### Output

Verrà generato un file di output in formato .txt contentente, per ogni riga:

- Nome del file caricato;
- FileKey;
- SHA256 del file.

# consolidatore_con020_PARAM.sh

## Descrizione

Versione customizzata dello script **consolidatore_con020.sh** con parametrizzazione di PA ID, AAR, documenti e indirizzi di spedizione.

E' studiato in modo che **AAR** (con SHA), **attachment** (con SHA) e **indirizzi** (a cui viene aggiunto il prefisso per il consolidatore) vengano presi da **array**.

Agendo sul codice si può far si che:

- I documenti vengano ciclati e resettati a ogni chiamata della funzione
- Il ciclo continui a incrementare anche tra chiamate (in ogni caso viene usato l'operatore modulo per ripartire dall'inizio dell'array una volta che si arriva alla fine)

## Utilizzo

```bash
 ./consolidatore_con020_PARAM.sh
```

**Nota**: i parametri di input vanno configurati modificando direttamente lo script (es: per aggiungere un indirizzo, aggiungere un nuovo item all'array degli indirizzi etc...)

## Output

Verrà generato un file di output in formato .txt contentente l'elenco dei **requestId** associati agli invii verso il consolidatore generati dallo script.
