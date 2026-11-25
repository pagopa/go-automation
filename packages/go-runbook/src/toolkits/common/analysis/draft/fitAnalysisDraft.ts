import { ANALYSIS_DRAFT_BOUNDS } from './analysisDraftBounds.js';
import type { KnownCaseAnalysisDraft } from './KnownCaseAnalysisDraft.js';
import type { AnalysisDraftLimits } from './AnalysisDraftLimits.js';
import type { AnalysisDraftParts } from './AnalysisDraftParts.js';

const DEFAULT_LIMITS: AnalysisDraftLimits = {
  textLength: ANALYSIS_DRAFT_BOUNDS.TEXT_LENGTH,
  draftBytes: ANALYSIS_DRAFT_BOUNDS.DRAFT_BYTES,
  arrayItems: ANALYSIS_DRAFT_BOUNDS.ARRAY_ITEMS,
};

const ELLIPSIS = '…';
/** Start of the line that counts the entries left out. */
const OMISSION = `${ELLIPSIS} e altri `;
/** Characters of the first entry always kept, with the coverage lines, before the lists are shortened. */
const MIN_FIRST_ENTRY = 200;

/**
 * Fits a composed draft to the limits of the analysis contract. Texts are measured as they are serialized: JSON
 * escapes of quotes, backslashes and newlines count.
 *
 * 1. `links` and `finalActions` keep at most the items of a reference list; `resources` and `downstreams` are never
 *    shortened (the registration check bounds them).
 * 2. The coverage lines and the start of the first entry are reserved: `links`, then `finalActions`, are shortened
 *    when the rest of the draft would leave no room for them.
 * 3. `conclusionNotes` and `errorDetails` keep whole entries, in order, while they fit the characters of the field and
 *    the bytes left; the last line then says how many entries were left out. When not even the first entry fits, it
 *    is shortened with «…»: the diagnosis and the coverage lines never disappear.
 * 4. The result is verified; a draft whose required envelope cannot fit is an error of the catalog.
 *
 * A draft that already fits is returned unchanged. Complexity: O(E · L) over entries and their length.
 *
 * @param draft - The composed draft
 * @param parts - The entries the composed texts are made of; absent for a single-case draft
 * @param limits - The limits to fit to; defaults to the analysis contract
 * @returns A draft within the limits
 * @throws Error when even the shortest draft exceeds the limits
 */
export function fitAnalysisDraft(
  draft: KnownCaseAnalysisDraft,
  parts?: AnalysisDraftParts,
  limits: AnalysisDraftLimits = DEFAULT_LIMITS,
): KnownCaseAnalysisDraft {
  const items = limits.arrayItems ?? ANALYSIS_DRAFT_BOUNDS.ARRAY_ITEMS;
  for (const list of ['resources', 'downstreams'] as const) {
    if (draft[list].length > items) {
      throw new Error(
        `Analysis draft has ${String(draft[list].length)} ${list}, over the ${String(items)} items allowed`,
      );
    }
  }
  const listed: KnownCaseAnalysisDraft = {
    ...draft,
    links: draft.links.slice(0, items),
    finalActions: draft.finalActions.slice(0, items),
  };
  if (fits(listed, limits)) return listed;

  const entries = parts?.noteEntries ?? [draft.conclusionNotes];
  const coverageLines = parts?.coverageLines ?? [];
  const detailEntries = parts?.detailEntries ?? (draft.errorDetails === undefined ? [] : [draft.errorDetails]);
  // The details are optional: when they take the room the diagnosis needs, the draft goes without them.
  const fitted =
    (detailEntries.length > 0 ? fitTexts(listed, entries, coverageLines, detailEntries, limits) : undefined) ??
    fitTexts(listed, entries, coverageLines, [], limits);
  if (fitted === undefined) {
    throw new Error(
      `Analysis draft cannot fit ${String(limits.draftBytes)} bytes: its required fields take ${String(envelopeBytes(listed, false))}`,
    );
  }
  return fitted;
}

/**
 * One attempt at fitting the texts, with or without details.
 *
 * @returns The fitted draft, or `undefined` when it exceeds the limits or loses the diagnosis
 */
function fitTexts(
  listed: KnownCaseAnalysisDraft,
  entries: ReadonlyArray<string>,
  coverageLines: ReadonlyArray<string>,
  detailEntries: ReadonlyArray<string>,
  limits: AnalysisDraftLimits,
): KnownCaseAnalysisDraft | undefined {
  const withDetails = detailEntries.length > 0;
  const minimum = jsonTextBytes([shorten(entries[0] ?? '', MIN_FIRST_ENTRY), ...coverageLines].join('\n'));
  let fitted = listed;
  for (const list of ['links', 'finalActions'] as const) {
    while (envelopeBytes(fitted, withDetails) + minimum > limits.draftBytes && fitted[list].length > 0) {
      fitted = { ...fitted, [list]: fitted[list].slice(0, -1) };
    }
  }

  // When the diagnosis does not survive (only the omission marker is left), the optional lists give way first.
  for (;;) {
    const candidate = composeTexts(fitted, entries, coverageLines, detailEntries, limits);
    if (candidate !== undefined) return candidate;
    if (fitted.links.length > 0) fitted = { ...fitted, links: fitted.links.slice(0, -1) };
    else if (fitted.finalActions.length > 0) fitted = { ...fitted, finalActions: fitted.finalActions.slice(0, -1) };
    else return undefined;
  }
}

/**
 * The texts composed within the budget the lists leave.
 *
 * @returns The draft, or `undefined` when it exceeds the limits or the notes lost the first diagnosis
 */
function composeTexts(
  fitted: KnownCaseAnalysisDraft,
  entries: ReadonlyArray<string>,
  coverageLines: ReadonlyArray<string>,
  detailEntries: ReadonlyArray<string>,
  limits: AnalysisDraftLimits,
): KnownCaseAnalysisDraft | undefined {
  const withDetails = detailEntries.length > 0;
  const minimum = jsonTextBytes([shorten(entries[0] ?? '', MIN_FIRST_ENTRY), ...coverageLines].join('\n'));
  const textBudget = Math.max(0, limits.draftBytes - envelopeBytes(fitted, withDetails));
  const notesBudget = withDetails ? Math.max(minimum, Math.ceil(textBudget / 2)) : textBudget;
  const conclusionNotes = fitText(entries, coverageLines, limits.textLength, notesBudget, 'casi');
  const detailsBudget = Math.max(0, textBudget - jsonTextBytes(conclusionNotes));
  const errorDetails = withDetails
    ? fitText(detailEntries, [], limits.textLength, detailsBudget, 'dettagli')
    : undefined;
  const { errorDetails: _previous, ...rest } = fitted;
  const candidate: KnownCaseAnalysisDraft = {
    ...rest,
    conclusionNotes,
    ...(errorDetails === undefined || errorDetails === '' ? {} : { errorDetails }),
  };

  // The notes must keep the first diagnosis, whole or shortened: neither an empty note nor the omission marker alone.
  const firstEntry = entries.find((entry) => entry !== '');
  const lostDiagnosis = firstEntry !== undefined && (conclusionNotes === '' || conclusionNotes.startsWith(OMISSION));
  return fits(candidate, limits) && !lostDiagnosis ? candidate : undefined;
}

/**
 * Keeps whole entries in order, then the closing lines, within the character limit and the serialized byte budget.
 *
 * @returns The fitted text
 */
function fitText(
  entries: ReadonlyArray<string>,
  closingLines: ReadonlyArray<string>,
  maxLength: number,
  maxBytes: number,
  noun: string,
): string {
  const closing = closingLines.join('\n');
  const within = (text: string): boolean => text.length <= maxLength && jsonTextBytes(text) <= maxBytes;
  const compose = (kept: ReadonlyArray<string>, omitted: number): string =>
    [...kept, ...(omitted > 0 ? [`${ELLIPSIS} e altri ${String(omitted)} ${noun} (vedi l'esecuzione)`] : []), closing]
      .filter((line) => line !== '')
      .join('\n');

  const kept: string[] = [];
  for (const entry of entries) {
    if (!within(compose([...kept, entry], entries.length - kept.length - 1))) break;
    kept.push(entry);
  }
  if (kept.length > 0 || entries.length === 0) return compose(kept, entries.length - kept.length);

  // Not even the first entry fits: shorten it, so the diagnosis and the closing lines stay.
  const tail = compose([], entries.length - 1);
  const separator = tail === '' ? 0 : 1;
  const first = shortenToFit(
    entries[0] ?? '',
    maxLength - tail.length - separator,
    maxBytes - jsonTextBytes(tail) - separator * 2,
  );
  return [first, tail].filter((line) => line !== '').join('\n');
}

/** The longest prefix of `text`, ended by «…» when cut, within both the characters and the serialized bytes. */
function shortenToFit(text: string, maxLength: number, maxBytes: number): string {
  let candidate = shorten(text, Math.max(0, maxLength));
  while (candidate !== '' && jsonTextBytes(candidate) > maxBytes) {
    const overshoot = jsonTextBytes(candidate) - maxBytes;
    const length = candidate.length - ELLIPSIS.length - Math.max(1, Math.floor(overshoot / 4));
    candidate = length <= 0 ? '' : `${text.slice(0, length)}${ELLIPSIS}`;
  }
  return candidate;
}

function shorten(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - ELLIPSIS.length))}${ELLIPSIS}`;
}

function fits(draft: KnownCaseAnalysisDraft, limits: AnalysisDraftLimits): boolean {
  return (
    draft.conclusionNotes.length <= limits.textLength &&
    (draft.errorDetails?.length ?? 0) <= limits.textLength &&
    draftBytes(draft) <= limits.draftBytes
  );
}

/** Bytes of the draft without its texts; `errorDetails` counts only when the draft will carry it. */
function envelopeBytes(draft: KnownCaseAnalysisDraft, withDetails: boolean): number {
  const { errorDetails: _details, ...rest } = draft;
  return draftBytes({ ...rest, conclusionNotes: '', ...(withDetails ? { errorDetails: '' } : {}) });
}

function draftBytes(draft: KnownCaseAnalysisDraft): number {
  return Buffer.byteLength(JSON.stringify(draft), 'utf8');
}

/** Bytes a text adds to the serialized draft: its JSON escapes included, the quotes excluded. */
function jsonTextBytes(text: string): number {
  return Buffer.byteLength(JSON.stringify(text), 'utf8') - 2;
}
