import { ensureInteger, ensurePositiveInteger } from '.';

export const findFirst = (subject: string, sub: string, start?: number, end?: number): number | null => {
  if (!subject || !sub) {
    return null;
  }
  const chars = [...subject];
  const subChars = [...sub];
  const len = chars.length;
  const subLen = subChars.length;
  if (subLen === 0 || subLen > len) {
    return null;
  }
  let s = ensureInteger(start ?? 0);
  if (s < 0) {
    s += len;
    if (s < 0) {
      s = 0;
    }
  } else if (s > len) {
    s = len;
  }
  let e = ensureInteger(end ?? len);
  if (e < 0) {
    e += len;
    if (e < 0) {
      e = 0;
    }
  } else if (e > len) {
    e = len;
  }
  if (s >= e || s + subLen > e) {
    return null;
  }
  for (let i = s; i <= e - subLen; i++) {
    let match = true;
    for (let j = 0; j < subLen; j++) {
      if (chars[i + j] !== subChars[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return null;
};
export const findLast = (subject: string, sub: string, start?: number, end?: number): number | null => {
  if (!subject || !sub) {
    return null;
  }
  const chars = [...subject];
  const subChars = [...sub];
  const len = chars.length;
  const subLen = subChars.length;
  if (subLen === 0 || subLen > len) {
    return null;
  }
  let s = ensureInteger(start ?? 0);
  if (s < 0) {
    s += len;
    if (s < 0) {
      s = 0;
    }
  } else if (s > len) {
    s = len;
  }
  let e = ensureInteger(end ?? len);
  if (e < 0) {
    e += len;
    if (e < 0) {
      e = 0;
    }
  } else if (e > len) {
    e = len;
  }
  if (s >= e || s + subLen > e) {
    return null;
  }
  for (let i = e - subLen; i >= s; i--) {
    let match = true;
    for (let j = 0; j < subLen; j++) {
      if (chars[i + j] !== subChars[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return null;
};
export const lower = (subject: string): string => subject.toLowerCase();
const ensurePadFuncParams = (name: string, width: number, padding = ' '): string => {
  if ([...padding].length !== 1) {
    throw new Error(`invalid value, ${name} expects its 'pad' parameter to be a valid string with a single codepoint`);
  }
  ensurePositiveInteger(width);
  return padding;
};
export const padLeft = (subject: string, width: number, padding?: string): string => {
  padding = ensurePadFuncParams('pad_left', width, padding);
  if (!subject) {
    return '';
  }
  const subjectLen = [...subject].length;
  if (subjectLen >= width) {
    return subject;
  }
  return padding.repeat(width - subjectLen) + subject;
};
export const padRight = (subject: string, width: number, padding?: string): string => {
  padding = ensurePadFuncParams('pad_right', width, padding);
  if (!subject) {
    return '';
  }
  const subjectLen = [...subject].length;
  if (subjectLen >= width) {
    return subject;
  }
  return subject + padding.repeat(width - subjectLen);
};
export const replace = (subject: string, string: string, by: string, count?: number): string => {
  if (count === 0) {
    return subject;
  }
  if (count === null || count === undefined) {
    return subject.split(string).join(by);
  }
  ensurePositiveInteger(count);
  if (string === '') {
    const parts = [...subject];
    const replaceCount = Math.min(count, Math.max(0, parts.length - 1));
    return parts.slice(0, replaceCount + 1).join(by) + parts.slice(replaceCount + 1).join('');
  }
  const parts = subject.split(string);
  if (parts.length <= 1) {
    return subject;
  }
  const replaceCount = Math.min(count, parts.length - 1);
  const replacedHead = parts.slice(0, replaceCount + 1).join(by);
  const remainingTail = parts.slice(replaceCount + 1).join(string);
  return remainingTail.length > 0 ? replacedHead + string + remainingTail : replacedHead;
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
  if (search === '') {
    const chars = [...subject];
    if (count === null || count === undefined) {
      return chars;
    }
    return [...chars.slice(0, count), chars.slice(count).join('')];
  }
  if (count === null || count === undefined) {
    return subject.split(search);
  }
  const split = subject.split(search);
  return [...split.slice(0, count), split.slice(count).join(search)];
};
export const trim = (subject: string, chars?: string): string => {
  return trimLeft(trimRight(subject, chars), chars);
};
export const trimLeft = (subject: string, chars?: string): string => {
  return trimImpl(subject, list => new RegExp(`^[${list}]*(.*?)`), chars);
};
export const trimRight = (subject: string, chars?: string): string => {
  return trimImpl(subject, list => new RegExp(`(.*?)[${list}]*$`), chars);
};
const trimImpl = (subject: string, regExper: (arg: string) => RegExp, chars?: string): string => {
  const pattern = chars ? chars.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') : '\\s\u0085';
  return subject.replace(regExper(pattern), '$1');
};

export const upper = (subject: string): string => subject.toUpperCase();
