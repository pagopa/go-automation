import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';

const ROME_WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', weekday: 'long' });
const DAY_MS = 24 * 60 * 60 * 1000;

/** A Monday occurrence requires the extra product and workflow-alarm checks in the source runbook. */
export class ClassifyDelayerAlarmDayStep implements Step<{ includesMonday: boolean }> {
  readonly id = 'classify-delayer-alarm-day';
  readonly label = 'Classificazione giorno allarme pn-delayer';
  readonly kind = 'transform' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<{ includesMonday: boolean }>> {
    const first = parseOccurrence(context.params.get('alarmDatetime'), 'alarmDatetime');
    const lastValue = context.params.get('alarmDatetimeEnd');
    const last =
      lastValue === undefined || lastValue.trim() === '' ? first : parseOccurrence(lastValue, 'alarmDatetimeEnd');
    if (last.getTime() < first.getTime()) {
      throw new Error('ClassifyDelayerAlarmDayStep: last occurrence precedes first occurrence');
    }

    const includesMonday = intervalIncludesRomeMonday(first, last);
    context.services.reporter.add({
      label: includesMonday
        ? 'Almeno un’occorrenza può ricadere di lunedì (Europe/Rome): verificare il workflow e avvisare prodotto'
        : 'Intervallo delle occorrenze senza lunedì (Europe/Rome)',
    });
    return {
      success: true,
      output: { includesMonday },
      vars: { delayerAlarmIncludesMonday: String(includesMonday) },
      next: 'resolve',
    };
  }
}

function parseOccurrence(value: string | undefined, field: string): Date {
  const parsed = value === undefined ? new Date(Number.NaN) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`ClassifyDelayerAlarmDayStep: invalid ${field}`);
  }
  return parsed;
}

/** Conservatively includes any Monday inside a multi-occurrence interval. */
function intervalIncludesRomeMonday(first: Date, last: Date): boolean {
  if (last.getTime() - first.getTime() >= 7 * DAY_MS) return true;
  if (isRomeMonday(first) || isRomeMonday(last)) return true;
  for (let time = first.getTime() + DAY_MS; time < last.getTime(); time += DAY_MS) {
    if (isRomeMonday(new Date(time))) return true;
  }
  return false;
}

function isRomeMonday(date: Date): boolean {
  return ROME_WEEKDAY.format(date) === 'Monday';
}
