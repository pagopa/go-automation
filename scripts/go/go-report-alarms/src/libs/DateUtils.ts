import { DateTime } from 'luxon';

export function googleSheetTimestamp(value: string | Date): string {
    return DateTime
        .fromJSDate(new Date(value), { zone: 'utc' })
        .toFormat('dd/MM/yyyy HH.mm.ss');
}