/**
 * Known cases for the pn-delivery-B2B-ApiGwAlarm runbook.
 *
 * Pattern conditions are anchored to the microservice error message
 * vars (`vars.<service>ErrorMsg`). The only case that needs to look at
 * `vars.apiGwStatusCode` is `gateway-timeout-504`, because no
 * application log is available to regex against (504 with no logs on
 * pn-delivery).
 */

import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  // ── Livello 2.1: pn-external-registries → Selfcare ReadTimeout ─────────
  {
    id: 'selfcare-timeout-external-registries',
    description: 'Timeout verso il servizio Downstream SelfCare da pn-external-registries',
    priority: 100,
    condition: {
      type: 'pattern',
      ref: 'vars.externalRegistriesErrorMsg',
      regex:
        '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=nested exception is io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Timeout verso il downstream SelfCare da pn-external-registries\n' +
        'Risoluzione: Problematica segnalata già da tempo al downstream coinvolto\n' +
        'Errore: {{vars.externalRegistriesErrorMsg}}',
    },
  },

  // ── Livello 2.1: pn-external-registries → ResourceAccessException ──────
  {
    id: 'selfcare-io-error-external-registries',
    description: 'I/O error su pn-external-registries verso ext-registry-private (Selfcare)',
    priority: 95,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'pattern',
          ref: 'vars.externalRegistriesErrorMsg',
          regex: 'ResourceAccessException.*I/O error on GET.*ext-registry-private.*Read timed out',
        },
        {
          type: 'pattern',
          ref: 'vars.externalRegistriesErrorMsg',
          regex: 'Exception caught by retry.*SocketTimeoutException.*Read timed out',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] I/O error su pn-external-registries verso ext-registry-private\n' +
        'Risoluzione: Problematica segnalata già da tempo al downstream coinvolto\n' +
        'Errore: {{vars.externalRegistriesErrorMsg}}',
    },
  },

  // ── Livello 2.2: pn-data-vault → Selfcare ReadTimeout ──────────────────
  {
    id: 'data-vault-selfcare-timeout',
    description: 'Timeout verso il downstream Selfcare da pn-data-vault (WebClientRequestException)',
    priority: 90,
    condition: {
      type: 'pattern',
      ref: 'vars.dataVaultErrorMsg',
      regex: 'WebClientRequestException.*ReadTimeoutException|ReadTimeoutException.*selfcare\\.pagopa\\.it',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Timeout verso il downstream Selfcare da pn-data-vault\n' +
        'Risoluzione: Solitamente causato da un disservizio temporaneo. Se non si riverifica nel breve è possibile ignorarlo\n' +
        'Errore: {{vars.dataVaultErrorMsg}}',
    },
  },

  // ── Livello 2.2: pn-data-vault → [DOWNSTREAM] SelfcarePG 500 ───────────
  {
    id: 'data-vault-selfcare-downstream',
    description: 'Errore 500 dal servizio Downstream SelfcarePG su pn-data-vault',
    priority: 85,
    condition: {
      type: 'pattern',
      ref: 'vars.dataVaultErrorMsg',
      regex: '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=500',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Errore 500 dal servizio Downstream SelfcarePG su pn-data-vault\n' +
        'Risoluzione: Solitamente causato da un disservizio temporaneo. Se non si riverifica nel breve è possibile ignorarlo\n' +
        'Errore: {{vars.dataVaultErrorMsg}}',
    },
  },

  // ── Livello 2.2: pn-data-vault → Connection aborted ────────────────────
  {
    id: 'data-vault-connection-aborted',
    description: "Connection aborted da pn-data-vault prima dell'invio della richiesta",
    priority: 80,
    condition: {
      type: 'pattern',
      ref: 'vars.dataVaultErrorMsg',
      regex: 'AbortedException.*Connection has been closed BEFORE send operation',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        "[CASO NOTO] Connection aborted da pn-data-vault prima dell'invio della richiesta\n" +
        "Risoluzione: Trattandosi di un evento occasionale non c'è nessuna azione da intraprendere\n" +
        'Errore: {{vars.dataVaultErrorMsg}}',
    },
  },

  // ── Livello 3: pn-ss → pn-f24 not has privilege (403) ──────────────────
  {
    id: 'pn-f24-not-privileged-pn-ss',
    description: 'Client pn-f24 non ha privilegi per leggere il document type su pn-ss (Comune di Monte San Savino)',
    priority: 75,
    condition: {
      type: 'pattern',
      ref: 'vars.ssErrorMsg',
      regex: 'pn-f24 not has privilege for read document type',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Client pn-f24 non ha privilegi per accedere a un file su pn-ss\n' +
        'Risoluzione: Verificare che la notifica sia associata all\'ente "Comune di Monte San Savino"\n' +
        'Errore: {{vars.ssErrorMsg}}',
    },
  },

  // ── Livello 1: pn-delivery → pn-external-registry unavailable ──────────
  {
    id: 'ext-registry-unavailable',
    description: 'Errore di rete su pn-delivery - pn-external-registry non disponibile',
    priority: 70,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'pattern',
          ref: 'vars.deliveryErrorMsg',
          regex: 'Error during retrieve of the group.*ResourceAccessException.*ext-registry-private.*Read timed out',
        },
        {
          type: 'and',
          conditions: [
            {
              type: 'pattern',
              ref: 'vars.deliveryErrorMsg',
              regex: 'Error during retrieve of the group',
            },
            {
              type: 'pattern',
              ref: 'vars.deliveryErrorMsg',
              regex: 'SocketTimeoutException.*Read timed out',
            },
          ],
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Errore di rete su pn-delivery - pn-external-registry non disponibile\n' +
        'Risoluzione: Da segnalare se si protrae nel tempo\n' +
        'Errore: {{vars.deliveryErrorMsg}}',
    },
  },

  // ── Gateway Timeout 504 senza log su pn-delivery ───────────────────────
  // Irrigidito ad AND status==504 + deliveryLogCount==0 (coerente con il
  // refactor di address-book-io, V02 §5.4).
  {
    id: 'gateway-timeout-504',
    description: 'Gateway Timeout 504 senza log applicativi su pn-delivery',
    priority: 60,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '504' },
        { type: 'compare', ref: 'vars.deliveryLogCount', operator: '==', value: '0' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Gateway Timeout 504 senza log di errore su pn-delivery\n' +
        'Risoluzione: Nessuna azione necessaria\n' +
        'Status Code: {{vars.apiGwStatusCode}}',
    },
  },
];
