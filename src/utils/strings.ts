import { ensureInteger, ensurePositiveInteger } from '.';

/** True when the UTF-16 unit at `i` continues the code point started at `i - 1`. */
const isLowSurrogate = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff;

const isHighSurrogate = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;

/** UTF-16 units occupied by the code point starting at `i`. */
const codePointWidth = (subject: string, i: number): number =>
  isHighSurrogate(subject.charCodeAt(i)) && isLowSurrogate(subject.charCodeAt(i + 1)) ? 2 : 1;

/** Code-point count of `subject`, without materialising an array of code points. */
export const countCodePoints = (subject: string, limit = subject.length): number => {
  let count = 0;
  const end = Math.min(limit, subject.length);
  // Only a low surrogate that follows a high one continues a pair; an unpaired
  // 0xDC00-0xDFFF unit counts as one code point, exactly as `[...subject]` does.
  for (let i = 0; i < end; i++) {
    const unit = subject.charCodeAt(i);
    if (isHighSurrogate(unit) && (subject.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      i++;
    }
    count++;
  }
  return count;
};

/**
 * True when `subject` holds no unpaired surrogate. Local equivalent of
 * `String.prototype.isWellFormed`, which the ES2022 lib target does not declare.
 */
const isWellFormed = (subject: string): boolean => {
  for (let i = 0; i < subject.length; i++) {
    const unit = subject.charCodeAt(i);
    if (isHighSurrogate(unit)) {
      // `next` is NaN at the end of the string, so the range test must be written
      // positively: `next < 0xdc00 || next > 0xdfff` would accept NaN.
      const next = subject.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      i++;
    } else if (isLowSurrogate(unit)) {
      return false;
    }
  }
  return true;
};

/**
 * UTF-16 offsets of the code-point window `[start, stop)` in a single walk.
 * A `null` stop runs to the end of the string. Both indices are clamped.
 */
export const codePointWindow = (subject: string, start: number, stop: number | null): [number, number] => {
  let from = -1;
  let count = 0;
  for (let i = 0; i < subject.length; i++) {
    const unit = subject.charCodeAt(i);
    if (count === start) {
      from = i;
      if (stop === null) {
        return [i, subject.length];
      }
      if (stop <= start) {
        return [i, i];
      }
    }
    if (stop !== null && count === stop) {
      return [from === -1 ? i : from, i];
    }
    if (isHighSurrogate(unit) && (subject.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      i++;
    }
    count++;
  }
  const end = subject.length;
  return [from === -1 ? end : from, end];
};

/**
 * Slice `subject` by code-point indices, matching the spec's string-slice semantics
 * in O(window) rather than O(length) for the usual `step === 1` case.
 */
export const sliceCodePoints = (subject: string, total: number, start: number, stop: number, step: number): string => {
  if (step === 1) {
    const [from, to] = codePointWindow(subject, start, stop >= total ? null : stop);
    return to > from ? subject.substring(from, to) : '';
  }
  // Non-unit steps need the whole sequence, so let the engine build it: the
  // iterator spread beats a manual push loop.
  const points = [...subject];
  const len = Math.max(0, Math.ceil((stop - start) / step));
  const result: string[] = new Array(len);
  let idx = 0;
  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      result[idx++] = points[i];
    }
  } else {
    for (let i = start; i > stop; i += step) {
      result[idx++] = points[i];
    }
  }
  return result.join('');
};

const normalizeBounds = (len: number, start?: number, end?: number): [number, number] => {
  let s = ensureInteger(start ?? 0);
  if (s < 0) {
    s = Math.max(0, len + s);
  }
  let e = ensureInteger(end ?? len);
  if (e < 0) {
    e = Math.max(0, len + e);
  }
  return [s, Math.min(len, e)];
};

/**
 * Search with the engine's own matcher, converting only the offset a candidate lands
 * on. A well-formed needle can never match across a code-point boundary, so a unit
 * level match is a code-point match; only its offset has to move into code-point units.
 *
 * The bounds are validated up front but resolved lazily: a code-point index never
 * exceeds the UTF-16 offset of the same position, so `start` is already a sound
 * `indexOf` hint and the code-point walk is deferred until a candidate exists. A
 * candidate outside the window means that hint was too loose — astral characters ahead
 * of `start`, or a unit offset beyond `end` that is still short of it in code points;
 * the exact window is then resolved once and the search restarts from its edge.
 */
const findByEngine = (
  fromEnd: boolean,
  subject: string,
  sub: string,
  needle: number,
  start?: number,
  end?: number,
): number | null => {
  const first = start === undefined ? 0 : ensureInteger(start);
  const last = end === undefined ? Number.POSITIVE_INFINITY : ensureInteger(end);
  // Only a negative bound wraps, and wrapping is the only thing that needs the total.
  const total = first < 0 || last < 0 ? countCodePoints(subject) : 0;
  const from = first < 0 ? Math.max(0, total + first) : first;
  // `last` is not clamped to `total`: a candidate always ends at or before the subject,
  // so a larger bound accepts exactly the same candidates.
  const to = last < 0 ? Math.max(0, total + last) : last;
  if (to !== Number.POSITIVE_INFINITY && to - needle < from) {
    return null;
  }
  // Each direction is spelled out rather than wrapped in a closure: the unbounded case
  // is the hot path and allocates nothing here.
  let index = fromEnd ? subject.lastIndexOf(sub, subject.length - 1) : subject.indexOf(sub, from);
  if (index === -1) {
    return null;
  }
  let point = countCodePoints(subject, index);
  // Only the cheap hint can land outside the window, on the edge this direction cannot
  // enforce: `from` is a lower bound on the UTF-16 offset of code point `from`, and
  // nothing past the end is known before `to` is resolved. The window test is monotone
  // in `point`, so the first candidate that reaches the window decides the answer, and
  // exact edges bound the search on the missing side — which makes one rescan enough.
  if (fromEnd ? to !== Number.POSITIVE_INFINITY && point + needle > to : point < from) {
    // `find_first` reads only the lower edge, so the walk stops at `from` there.
    const [lo, hi] = codePointWindow(subject, from, fromEnd && to !== Number.POSITIVE_INFINITY ? to : null);
    // `lastIndexOf` clamps a negative fromIndex to 0, so a tail window shorter than the
    // needle has to report no match instead of rescanning from the subject start.
    index = fromEnd ? (hi < sub.length ? -1 : subject.lastIndexOf(sub, hi - sub.length)) : subject.indexOf(sub, lo);
    if (index === -1) {
      return null;
    }
    point = countCodePoints(subject, index);
  }
  if (fromEnd) {
    return point >= from ? point : null;
  }
  return to === Number.POSITIVE_INFINITY || point + needle <= to ? point : null;
};

const find = (fromEnd: boolean, subject: string, sub: string, start?: number, end?: number): number | null => {
  if (!subject || !sub) {
    return null;
  }
  const needle = countCodePoints(sub);
  if (isWellFormed(sub)) {
    return findByEngine(fromEnd, subject, sub, needle, start, end);
  }
  // A needle holding an unpaired surrogate has no code-point boundary to anchor the
  // engine's match on, so the window is walked a code point at a time instead.
  const [s, e] = normalizeBounds(countCodePoints(subject), start, end);
  const last = e - needle;
  if (last < s) {
    return null;
  }
  // Compare code points through UTF-16 offsets so no code-point array is built.
  const matchAt = (offset: number): boolean => {
    let i = offset;
    let j = 0;
    while (j < sub.length) {
      const width = codePointWidth(sub, j);
      if (subject.codePointAt(i) !== sub.codePointAt(j)) {
        return false;
      }
      i += width;
      j += width;
    }
    return true;
  };
  let found = -1;
  let offset = codePointWindow(subject, s, null)[0];
  for (let point = s; point <= last; point++) {
    if (matchAt(offset)) {
      if (!fromEnd) {
        return point;
      }
      found = point;
    }
    offset += codePointWidth(subject, offset);
  }
  return found === -1 ? null : found;
};

export const findFirst = (subject: string, sub: string, start?: number, end?: number): number | null =>
  find(false, subject, sub, start, end);

export const findLast = (subject: string, sub: string, start?: number, end?: number): number | null =>
  find(true, subject, sub, start, end);

// JEP-14 forbids only a non-integer or a negative `width`; this ceiling is our own resource
// guard, so the error keeps the compliance name `invalid-value` and adds a `resource limit`
// label instead of reading like a spec violation. It is documented under the README's
// execution limits and checked before anything is allocated.
const MAX_PAD_WIDTH = 1_000_000;

const createPad =
  (isLeft: boolean, name: string) =>
  (subject: string, width: number, padding = ' ', maxOutputSize?: number): string => {
    if (countCodePoints(padding) !== 1) {
      throw new Error(
        `invalid value, ${name} expects its 'pad' parameter to be a valid string with a single codepoint`,
      );
    }
    ensurePositiveInteger(width);
    const padLen = width - countCodePoints(subject);
    if (padLen <= 0) {
      return subject;
    }
    const outputLen = subject.length + padLen * padding.length;
    if (maxOutputSize !== undefined && outputLen > maxOutputSize) {
      throw new Error(`Output size exceeds maximum allowed size of ${maxOutputSize}`);
    }
    if (width > MAX_PAD_WIDTH) {
      throw new Error(
        `invalid-value: ${name}() width ${width} exceeds maximum allowed width of ${MAX_PAD_WIDTH} (resource limit)`,
      );
    }
    const pad = padding.repeat(padLen);
    return isLeft ? pad + subject : subject + pad;
  };

export const padLeft = createPad(true, 'pad_left');
export const padRight = createPad(false, 'pad_right');

export const replace = (subject: string, string: string, by: string, count?: number): string => {
  if (count === 0) {
    return subject;
  }
  const parts = string === '' ? [...subject] : subject.split(string);
  if (count === null || count === undefined) {
    return parts.join(by);
  }
  ensurePositiveInteger(count);
  return count >= parts.length - 1
    ? parts.join(by)
    : [...parts.slice(0, count), parts.slice(count).join(string)].join(by);
};

export const split = (subject: string, search: string, count?: number): string[] => {
  if (subject.length === 0 && search.length === 0) {
    return [];
  }
  if (count !== null && count !== undefined) {
    ensurePositiveInteger(count);
    if (count === 0) {
      return [subject];
    }
  }
  const parts = search === '' ? [...subject] : subject.split(search);
  if (count === null || count === undefined || count >= parts.length - 1) {
    return parts;
  }
  return [...parts.slice(0, count), parts.slice(count).join(search)];
};

const isWhiteSpace = (ch: string): boolean => /^\p{White_Space}$/u.test(ch);

/** UTF-16 units occupied by the code point ending at `end`. */
const codePointWidthBefore = (subject: string, end: number): number =>
  isLowSurrogate(subject.charCodeAt(end - 1)) && isHighSurrogate(subject.charCodeAt(end - 2)) ? 2 : 1;

const trimImpl = (subject: string, left: boolean, right: boolean, chars?: string): string => {
  const set = chars ? new Set(chars) : null;
  const matches = (ch: string): boolean => (set ? set.has(ch) : isWhiteSpace(ch));
  // Trim by code point over UTF-16 offsets: only the trimmed edges are materialised.
  let start = 0;
  let end = subject.length;
  while (left && start < end) {
    const width = codePointWidth(subject, start);
    if (!matches(subject.slice(start, start + width))) {
      break;
    }
    start += width;
  }
  while (right && end > start) {
    const width = codePointWidthBefore(subject, end);
    if (!matches(subject.slice(end - width, end))) {
      break;
    }
    end -= width;
  }
  return start === 0 && end === subject.length ? subject : subject.substring(start, end);
};

export const trimLeft = (subject: string, chars?: string): string => trimImpl(subject, true, false, chars);
export const trimRight = (subject: string, chars?: string): string => trimImpl(subject, false, true, chars);
export const trim = (subject: string, chars?: string): string => trimImpl(subject, true, true, chars);
