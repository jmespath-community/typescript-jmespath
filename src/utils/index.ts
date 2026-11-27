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
  return ch >= '0' && ch <= '9';
};
export const isAlphaNum = (ch: string): boolean => {
  return isAlpha(ch) || isNum(ch);
};

export const ensureInteger = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('invalid-value: expecting an integer.');
  }
  return value;
};
export const ensurePositiveInteger = (value: unknown): number => {
  if (typeof value !== 'number' || value < 0 || !Number.isSafeInteger(value)) {
    throw new Error('invalid-value: expecting a non-negative integer.');
  }
  return value;
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

/**
 * JMESPath numbers have no infinite value: the grammar raises `not-a-number` when an
 * arithmetic expression overflows. Without this the result reaches JSON.stringify as
 * `null`, indistinguishable from a legitimate null. NaN is left alone, since an empty
 * `avg()` is an empty-input question rather than an overflow.
 */
export const ensureNoOverflow = (result: number): number => {
  if (result === Number.POSITIVE_INFINITY || result === Number.NEGATIVE_INFINITY) {
    throw new Error('not-a-number: arithmetic overflow');
  }
  return result;
};

const binOp =
  (fn: (a: number, b: number) => number) =>
  (left?: JSONValue, right?: JSONValue): number => {
    ensureNumbers(left, right);
    return ensureNoOverflow(fn(left as number, right as number));
  };

export const add = binOp((a, b) => a + b);
export const sub = binOp((a, b) => a - b);
export const mul = binOp((a, b) => a * b);
export const divide = binOp((a, b) => a / notZero(b));
/**
 * `//` floors, matching the operator glyph JEP-16 borrows from Python. IEEE-754 rounds
 * the quotient before it is floored, so a quotient above `Number.MAX_SAFE_INTEGER` can
 * land one step off the true floor (`1e17 // 7` is `14285714285714286`); exact
 * big-magnitude division is out of scope, doubles are the number model here.
 */
export const div = binOp((a, b) => Math.floor(a / notZero(b)));
/**
 * `%` follows `//`: the remainder takes the divisor's sign, which is what keeps
 * `a === (a // b) * b + (a % b)` true when the operands disagree in sign. JS `%` truncates
 * toward zero instead. Only a remainder of the wrong sign is adjusted — `((a % b) + b) % b`
 * would round away a dividend already inside a huge divisor's range — and a zero remainder
 * is reported as `+0`, so `-4 % 2` does not surface a negative zero.
 */
export const mod = binOp((a, b) => {
  const divisor = notZero(b);
  const remainder = a % divisor;
  if (remainder === 0) {
    return 0;
  }
  return Math.sign(remainder) !== Math.sign(divisor) ? remainder + divisor : remainder;
});

export * from './ast';
