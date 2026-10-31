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
    const keys = Object.keys(first);
    if (keys.length !== Object.keys(second).length) {
      return false;
    }
    return keys.every(
      key => Object.prototype.hasOwnProperty.call(second, key) && strictDeepEqual(first[key], second[key]),
    );
  }
  return false;
};

export const isFalse = (obj: unknown): boolean => {
  if (obj == null || obj === false) {
    return true;
  }
  if (typeof obj === 'string') {
    return obj === '';
  }
  if (typeof obj === 'object') {
    return Array.isArray(obj) ? obj.length === 0 : Object.keys(obj).length === 0;
  }
  return false;
};

export const isAlpha = (ch: string): boolean => {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
};

export const isNum = (ch: string): boolean => {
  return (ch >= '0' && ch <= '9') || ch === '-';
};
export const isAlphaNum = (ch: string): boolean => {
  return isAlpha(ch) || (ch >= '0' && ch <= '9');
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

const binOp =
  (fn: (a: number, b: number) => number) =>
  (left?: JSONValue, right?: JSONValue): number => {
    ensureNumbers(left, right);
    return fn(left as number, right as number);
  };

export const add = binOp((a, b) => a + b);
export const sub = binOp((a, b) => a - b);
export const mul = binOp((a, b) => a * b);
export const divide = binOp((a, b) => a / notZero(b));
export const div = binOp((a, b) => Math.floor(a / notZero(b)));
export const mod = binOp((a, b) => a % b);

export * from './ast';
