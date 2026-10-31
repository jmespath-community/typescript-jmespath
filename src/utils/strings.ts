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

export const findFirst = (subject: string, sub: string, start?: number, end?: number): number | null => {
  if (!subject || !sub) {
    return null;
  }
  const chars = [...subject];
  const [s, e] = normalizeBounds(chars.length, start, end);
  const target = chars.slice(s, e).join('');
  const idx = target.indexOf(sub);
  return idx === -1 ? null : [...target.slice(0, idx)].length + s;
};

export const findLast = (subject: string, sub: string, start?: number, end?: number): number | null => {
  if (!subject || !sub) {
    return null;
  }
  const chars = [...subject];
  const [s, e] = normalizeBounds(chars.length, start, end);
  const target = chars.slice(s, e).join('');
  const idx = target.lastIndexOf(sub);
  return idx === -1 ? null : [...target.slice(0, idx)].length + s;
};

export const lower = (subject: string): string => subject.toLowerCase();

const createPad =
  (isLeft: boolean, name: string) =>
  (subject: string, width: number, padding = ' '): string => {
    if ([...padding].length !== 1) {
      throw new Error(
        `invalid value, ${name} expects its 'pad' parameter to be a valid string with a single codepoint`,
      );
    }
    ensurePositiveInteger(width);
    if (!subject) {
      return '';
    }
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
  const parts = subject.split(string);
  if (count === null || count === undefined) {
    return parts.join(by);
  }
  ensurePositiveInteger(count);
  const head = parts.slice(0, count + 1).join(by);
  const tail = parts.slice(count + 1).join(string);
  return tail.length > 0 ? head + string + tail : head;
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
  if (count === null || count === undefined) {
    return parts;
  }
  return [...parts.slice(0, count), parts.slice(count).join(search)];
};

const trimImpl = (subject: string, pattern: string, chars?: string): string => {
  const charClass = chars ? chars.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') : '\\s\u0085';
  return subject.replace(new RegExp(pattern.replace('%s', charClass)), '$1');
};

export const trimLeft = (subject: string, chars?: string): string => trimImpl(subject, '^[%s]*(.*?)', chars);
export const trimRight = (subject: string, chars?: string): string => trimImpl(subject, '(.*?)[%s]*$', chars);
export const trim = (subject: string, chars?: string): string => trimLeft(trimRight(subject, chars), chars);

export const upper = (subject: string): string => subject.toUpperCase();
