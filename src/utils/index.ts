import { JSONValue } from '../JSON.type';

export const isObject = (obj: unknown): obj is Record<string, unknown> => {
  return obj !== null && Object.prototype.toString.call(obj) === '[object Object]';
};

export const strictDeepEqual = (first: unknown, second: unknown): boolean => {
  if (first === second) {
    return true;
  }
  if (typeof first !== typeof second) {
    return false;
  }
  if (Array.isArray(first) && Array.isArray(second)) {
    if (first.length !== second.length) {
      return false;
    }
    for (let i = 0; i < first.length; i += 1) {
      if (!strictDeepEqual(first[i], second[i])) {
        return false;
      }
    }
    return true;
  }
  if (isObject(first) && isObject(second)) {
    const firstEntries = Object.entries(first);
    const secondKeys = new Set(Object.keys(second));
    if (firstEntries.length !== secondKeys.size) {
      return false;
    }
    for (const [key, value] of firstEntries) {
      if (!strictDeepEqual(value, second[key])) {
        return false;
      }
      secondKeys.delete(key);
    }
    return secondKeys.size === 0;
  }
  return false;
};

export const isFalse = (obj: unknown): boolean => {
  if (typeof obj === 'object') {
    if (obj === null) {
      return true;
    }
    if (Array.isArray(obj)) {
      return obj.length === 0;
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    for (const _key in obj) {
      return false;
    }
    return true;
  }
  return !(typeof obj === 'number' || obj);
};

export const isAlpha = (ch: string): boolean => {
  // tslint:disable-next-line: strict-comparisons
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
};

export const isNum = (ch: string): boolean => {
  // tslint:disable-next-line: strict-comparisons
  return (ch >= '0' && ch <= '9') || ch === '-';
};
export const isAlphaNum = (ch: string): boolean => {
  // tslint:disable-next-line: strict-comparisons
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_';
};

export const ensureInteger = (value: unknown): number => {
  if (!(typeof value === 'number') || Math.floor(value) !== value) {
    throw new Error('invalid-value: expecting an integer.');
  }
  return <number>value;
};
export const ensurePositiveInteger = (value: unknown): number => {
  if (!(typeof value === 'number') || <number>value < 0 || Math.floor(value) !== value) {
    throw new Error('invalid-value: expecting a non-negative integer.');
  }
  return <number>value;
};

export const ensureNumbers = (...operands: (JSONValue | undefined)[]): void => {
  for (let i = 0; i < operands.length; i++) {
    if (operands[i] === null || operands[i] === undefined) {
      throw new Error('not-a-number: undefined');
    }
    if (typeof operands[i] !== 'number') {
      throw new Error('not-a-number');
    }
  }
};

const notZero = (n: number): number => {
  n = +n; // coerce to number
  if (!n) {
    // matches -0, +0, NaN
    throw new Error('not-a-number: divide by zero');
  }
  return n;
};

export const add = (left?: JSONValue, right?: JSONValue): number => {
  ensureNumbers(left, right);
  const result = (left as number) + (right as number);
  return result;
};
export const sub = (left?: JSONValue, right?: JSONValue): number => {
  ensureNumbers(left, right);
  const result = (left as number) - (right as number);
  return result;
};
export const mul = (left?: JSONValue, right?: JSONValue): number => {
  ensureNumbers(left, right);
  const result = (left as number) * (right as number);
  return result;
};
export const divide = (left?: JSONValue, right?: JSONValue): number => {
  ensureNumbers(left, right);
  const result = (left as number) / notZero(right as number);
  return result;
};
export const div = (left?: JSONValue, right?: JSONValue): number => {
  ensureNumbers(left, right);
  const result = Math.floor((left as number) / notZero(right as number));
  return result;
};
export const mod = (left?: JSONValue, right?: JSONValue): number => {
  ensureNumbers(left, right);
  const result = (left as number) % (right as number);
  return result;
};
