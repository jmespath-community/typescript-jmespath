import { expectError } from './error.utils';
import { divide, strictDeepEqual } from '../src/utils';

describe('strictDeepEqual', () => {
  it('should compare scalars', () => {
    expect(strictDeepEqual('a', 'a')).toStrictEqual(true);
  });
  it('should be false for different types', () => {
    expect(strictDeepEqual('a', 2)).toStrictEqual(false);
  });
  it('should be false for arrays of different lengths', () => {
    expect(strictDeepEqual([0, 1], [1, 2, 3])).toStrictEqual(false);
  });
  it('should be true for identical arrays', () => {
    expect(strictDeepEqual([0, 1], [0, 1])).toStrictEqual(true);
  });
  it('should be true for nested arrays', () => {
    expect(
      strictDeepEqual(
        [
          [0, 1],
          [2, 3],
        ],
        [
          [0, 1],
          [2, 3],
        ],
      ),
    ).toStrictEqual(true);
  });
  it('should be true for nested arrays of strings', () => {
    expect(
      strictDeepEqual(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
      ),
    ).toStrictEqual(true);
  });
  it('should be false for different arrays of the same length', () => {
    expect(strictDeepEqual([0, 1], [1, 2])).toStrictEqual(false);
  });
  it('should handle object literals', () => {
    expect(strictDeepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toStrictEqual(true);
  });
  it('should handle keys in first not in second', () => {
    expect(strictDeepEqual({ a: 1, b: 2 }, { a: 1 })).toStrictEqual(false);
  });
  it('should handle keys in second not in first', () => {
    expect(strictDeepEqual({ a: 1 }, { a: 1, b: 2 })).toStrictEqual(false);
  });
  it('should handle nested objects', () => {
    expect(strictDeepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toStrictEqual(true);
  });
  it('should handle nested objects that are not equal', () => {
    expect(strictDeepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 4] } })).toStrictEqual(false);
  });
});

describe('should throw a readable error when invalid arguments are provided to a function', () => {
  it('divide()', () => {
    expectError(() => divide(3, 0), 'not-a-number');
  });
  it('divide->ensureNumbers', () => {
    expectError(() => divide(3, 'zero'), 'not-a-number');
  });
  it('divide->ensureNumbers', () => {
    expectError(() => divide(3, null), 'not-a-number');
  });
  it('divide->ensureNumbers', () => {
    expectError(() => divide(null, 42), 'not-a-number');
  });
  it('divide->ensureNumbers', () => {
    expectError(() => divide('zero', 42), 'not-a-number');
  });
});

