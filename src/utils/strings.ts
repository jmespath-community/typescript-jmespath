import { ensureInteger, ensurePositiveInteger } from '.';

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

const indexOfCodePoints = (haystack: string[], needle: string[], fromEnd: boolean): number => {
  const last = haystack.length - needle.length;
  for (let i = fromEnd ? last : 0; fromEnd ? i >= 0 : i <= last; i += fromEnd ? -1 : 1) {
    if (needle.every((c, j) => haystack[i + j] === c)) {
      return i;
    }
  }
  return -1;
};

const find = (fromEnd: boolean, subject: string, sub: string, start?: number, end?: number): number | null => {
  if (!subject || !sub) {
    return null;
  }
  const chars = [...subject];
  const [s, e] = normalizeBounds(chars.length, start, end);
  const idx = indexOfCodePoints(chars.slice(s, e), [...sub], fromEnd);
  return idx === -1 ? null : idx + s;
};

export const findFirst = (subject: string, sub: string, start?: number, end?: number): number | null =>
  find(false, subject, sub, start, end);

export const findLast = (subject: string, sub: string, start?: number, end?: number): number | null =>
  find(true, subject, sub, start, end);

const createPad =
  (isLeft: boolean, name: string) =>
  (subject: string, width: number, padding = ' '): string => {
    if ([...padding].length !== 1) {
      throw new Error(
        `invalid value, ${name} expects its 'pad' parameter to be a valid string with a single codepoint`,
      );
    }
    ensurePositiveInteger(width);
    const padLen = width - [...subject].length;
    if (padLen <= 0) {
      return subject;
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

const trimImpl = (subject: string, pattern: string, chars?: string): string => {
  const charClass = chars ? chars.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') : '\\p{White_Space}';
  return subject.replace(new RegExp(pattern.replace('%s', charClass), 'u'), '');
};

export const trimLeft = (subject: string, chars?: string): string => trimImpl(subject, '^[%s]+', chars);
export const trimRight = (subject: string, chars?: string): string => trimImpl(subject, '[%s]+$', chars);
export const trim = (subject: string, chars?: string): string => trimLeft(trimRight(subject, chars), chars);
