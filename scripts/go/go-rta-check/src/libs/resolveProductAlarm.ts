import type { Core } from '@go-automation/go-common';
import { RUNBOOK_REGISTRY } from 'go-analyze-alarm/api';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { AlarmDto, ProductDto } from '../types/WatchtowerDtos.js';
import type { WatchtowerClient } from '../watchtower/WatchtowerClient.js';

/** Resolved product + alarm (runbook) to test. */
export interface ProductAlarm {
  readonly productId: string;
  readonly productName: string;
  readonly alarm: AlarmDto;
  readonly alarmName: string;
}

/**
 * Resolves the product and the alarm to test (interactively when not provided
 * via config). Only alarms with a local runbook in {@link RUNBOOK_REGISTRY} are
 * offered. Returns `undefined` (with a logged reason) when resolution fails.
 */
export async function resolveProductAlarm(
  script: Core.GOScript,
  client: WatchtowerClient,
  config: GoRtaCheckConfig,
): Promise<ProductAlarm | undefined> {
  const logger = script.logger;

  const products = await client.listProducts();
  if (products.length === 0) {
    logger.error('Nessun prodotto disponibile in Watchtower.');
    return undefined;
  }
  const productId = config.productId ?? (await selectProduct(script, products));
  if (productId === undefined) {
    logger.warning('Nessun prodotto selezionato.');
    return undefined;
  }
  const productName = products.find((product) => product.id === productId)?.name ?? productId;

  const alarms = await client.listProductAlarms(productId);
  const testable = alarms.filter((alarm) => RUNBOOK_REGISTRY.has(alarm.name));
  if (testable.length === 0) {
    logger.error('Nessun allarme con runbook locale per questo prodotto.');
    return undefined;
  }
  const alarmName = config.alarmName ?? (await selectAlarm(script, testable));
  if (alarmName === undefined) {
    logger.warning('Nessun allarme selezionato.');
    return undefined;
  }
  const alarm = alarms.find((candidate) => candidate.name === alarmName);
  if (alarm === undefined || !RUNBOOK_REGISTRY.has(alarmName)) {
    logger.error(`Allarme "${alarmName}" non trovato nel prodotto o senza runbook locale.`);
    return undefined;
  }

  return { productId, productName, alarm, alarmName };
}

async function selectProduct(script: Core.GOScript, products: ReadonlyArray<ProductDto>): Promise<string | undefined> {
  return script.prompt.select<string>(
    'Seleziona il prodotto',
    products.map((product) => ({ title: product.name, value: product.id })),
  );
}

async function selectAlarm(script: Core.GOScript, alarms: ReadonlyArray<AlarmDto>): Promise<string | undefined> {
  return script.prompt.select<string>(
    "Seleziona l'allarme (runbook da testare)",
    alarms.map((alarm) => ({ title: alarm.name, value: alarm.name })),
  );
}
