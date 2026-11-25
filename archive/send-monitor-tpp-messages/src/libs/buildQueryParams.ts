/**
 * Builds Athena query parameters from a date range.
 */

import { formatDateForAthena, getDateComponents } from './DateUtils.js';
import type { QueryParams } from '../types/QueryParams.js';

/**
 * Builds query parameters from parsed date range.
 *
 * @param startDate - Start date for query
 * @param endDate - End date for query
 * @returns Query parameters object
 */
export function buildQueryParams(startDate: Date, endDate: Date): QueryParams {
  const startComponents = getDateComponents(startDate);
  const endComponents = getDateComponents(endDate);

  return {
    startDate: formatDateForAthena(startDate),
    endDate: formatDateForAthena(endDate),
    startYear: startComponents.year,
    startMonth: startComponents.month,
    startDay: startComponents.day,
    startHour: startComponents.hour,
    endYear: endComponents.year,
    endMonth: endComponents.month,
    endDay: endComponents.day,
    endHour: endComponents.hour,
  };
}
