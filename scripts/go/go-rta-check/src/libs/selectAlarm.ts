/**
 * Runbook step of the interactive selection.
 *
 * Only alarms with a local runbook are offered, and they are ranked by how many
 * occurrences Watchtower recorded in the selected environment: environment
 * specific runbooks (the INTEROP ones carry the environment in the alarm name)
 * surface first, while runbooks that never fired there are hidden behind an
 * explicit "show all" entry instead of being dropped — SEND runbooks are valid
 * for every environment even when the window is empty.
 */
import type { Core } from '@go-automation/go-common';
import { RUNBOOK_REGISTRY } from '@go-automation/go-runbook/catalog';
import type { AlarmDto, WatchtowerClient } from '@go-automation/go-watchtower-client';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { ProductAlarm } from '../types/ProductAlarm.js';
import type { ResolvedEnvironment } from '../types/ResolvedEnvironment.js';
import type { WizardStep } from '../types/WizardStep.js';
import { countAlarmOccurrences } from './countAlarmOccurrences.js';
import type { AlarmOccurrences } from './countAlarmOccurrences.js';
import { BACK_CHOICE, promptChoice } from './promptChoice.js';
import type { SelectedProduct } from './selectProduct.js';

/** Reserved value of the "show every runbook" entry. */
const SHOW_ALL_CHOICE = '\u0000all';

/** Rank given to a runbook whose count could not be read: after the firing ones, before the idle ones. */
const UNKNOWN_COUNT_RANK = 0.5;

/** The read surface of the Watchtower client used here. */
export type AlarmReader = Pick<WatchtowerClient, 'listProductAlarms' | 'countAlarmEvents'>;

export interface SelectAlarmOptions {
  readonly script: Core.GOScript;
  readonly client: AlarmReader;
  readonly product: SelectedProduct;
  readonly environment: ResolvedEnvironment;
  readonly config: GoRtaCheckConfig;
  /** Whether the wizard may ask; when false an unpinned runbook aborts. */
  readonly allowPrompt: boolean;
  /** Whether a previous interactive step exists to go back to. */
  readonly canGoBack: boolean;
}

/**
 * Resolves the alarm (= runbook) to test: pinned by `--alarm-name`, otherwise
 * chosen from the testable alarms of the product, annotated with their
 * occurrences in the selected environment.
 *
 * @param options - Step dependencies and configuration
 * @returns The resolved product + alarm, a back request, or an abort
 */
export async function selectAlarm(options: SelectAlarmOptions): Promise<WizardStep<ProductAlarm>> {
  const { script, product, environment } = options;
  const logger = script.logger;

  const alarms = await options.client.listProductAlarms(product.productId);
  const testable = alarms.filter((alarm) => RUNBOOK_REGISTRY.has(alarm.name));
  if (testable.length === 0) {
    logger.error(`Nessun allarme con runbook locale per il prodotto ${product.productName}.`);
    return { kind: 'ABORT' };
  }

  const pinnedName = options.config.alarmName;
  if (pinnedName !== undefined && pinnedName !== '') {
    const pinned = testable.find((alarm) => alarm.name === pinnedName);
    if (pinned === undefined) {
      logger.error(`Allarme "${pinnedName}" non trovato nel prodotto o senza runbook locale.`);
      return { kind: 'ABORT' };
    }
    return value(product, pinned, false);
  }
  if (!options.allowPrompt) {
    logger.error('Runbook non selezionabile in modalità non interattiva: passa --alarm-name.');
    return { kind: 'ABORT' };
  }

  script.prompt.startSpinner(`Conteggio occorrenze per ambiente (${environment.environmentName}) …`);
  const counted = await countAlarmOccurrences(options.client, testable, environment.environmentIds);
  script.prompt.stopSpinner();

  const idle = counted.filter((entry) => entry.count === 0);
  const firing = counted.filter((entry) => entry.count !== 0);
  let showAll = firing.length === 0;
  if (showAll && idle.length > 0) {
    logger.warning(`Nessun runbook con occorrenze in ${environment.environmentName}: mostro tutto il catalogo.`);
  }

  for (;;) {
    const visible = sortByRelevance(showAll ? counted : firing);
    const hidden = showAll ? 0 : idle.length;
    const choice = await promptChoice<string>(
      script,
      `Seleziona il runbook da testare (${product.productName} · ${environment.environmentName})`,
      [
        ...visible.map(toChoice),
        ...(hidden > 0
          ? [
              {
                title: `▸ Mostra anche i ${String(hidden)} runbook senza occorrenze in ${environment.environmentName}`,
                value: SHOW_ALL_CHOICE,
              },
            ]
          : []),
        ...(options.canGoBack ? [{ title: '← Indietro: cambia ambiente o prodotto', value: BACK_CHOICE }] : []),
      ],
    );

    if (choice === BACK_CHOICE) return { kind: 'BACK' };
    if (choice === undefined) return { kind: 'ABORT' };
    if (choice === SHOW_ALL_CHOICE) {
      showAll = true;
      continue;
    }
    const selected = testable.find((alarm) => alarm.name === choice);
    if (selected === undefined) return { kind: 'ABORT' };
    return value(product, selected, true);
  }
}

/** Firing runbooks first (most occurrences first), unknown counts next, idle ones last. */
function sortByRelevance(entries: ReadonlyArray<AlarmOccurrences>): ReadonlyArray<AlarmOccurrences> {
  return [...entries].sort(
    (left, right) => rank(right) - rank(left) || left.alarm.name.localeCompare(right.alarm.name),
  );
}

function rank(entry: AlarmOccurrences): number {
  return entry.count ?? UNKNOWN_COUNT_RANK;
}

function toChoice(entry: AlarmOccurrences): Core.GOPromptSelectOption {
  const description = entry.alarm.description;
  return {
    title: `${entry.alarm.name} · ${occurrencesLabel(entry.count)}`,
    value: entry.alarm.name,
    ...(description !== null && description !== undefined && description !== '' ? { description } : {}),
  };
}

function occurrencesLabel(count: number | undefined): string {
  if (count === undefined) return 'conteggio non disponibile';
  if (count === 0) return 'nessuna occorrenza';
  return count === 1 ? '1 occorrenza' : `${String(count)} occorrenze`;
}

function value(product: SelectedProduct, alarm: AlarmDto, interactive: boolean): WizardStep<ProductAlarm> {
  return {
    kind: 'VALUE',
    value: { productId: product.productId, productName: product.productName, alarm, alarmName: alarm.name },
    interactive,
  };
}
