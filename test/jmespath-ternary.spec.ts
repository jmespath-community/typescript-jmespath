import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe('JMESPath Ternary Operations', () => {
  const data = {
    true: true,
    false: false,
    foo: 'foo',
    bar: 'bar',
    baz: 'baz',
    qux: 'qux',
    quux: 'quux',
    two: 2,
    fourty: 40,
  };

  describe('Basic Ternary Operations', () => {
    it('should return foo when condition is true', () => {
      expect(jmespath.search(data, 'true ? foo : bar')).toBe('foo');
    });

    it('should return bar when condition is false', () => {
      expect(jmespath.search(data, 'false ? foo : bar')).toBe('bar');
    });

    it('should return bar when condition is null', () => {
      expect(jmespath.search(data, '`null` ? foo : bar')).toBe('bar');
    });

    it('should return bar when condition is empty array', () => {
      expect(jmespath.search(data, '`[]` ? foo : bar')).toBe('bar');
    });

    it('should return bar when condition is not an empty array', () => {
      expect(jmespath.search(data, '`[1]` ? foo : bar')).toBe('foo');
    });

    it('should return bar when condition is empty object', () => {
      expect(jmespath.search(data, '`{}` ? foo : bar')).toBe('bar');
    });

    it('should return bar when condition is empty string', () => {
      expect(jmespath.search(data, "'' ? foo : bar")).toBe('bar');
    });
  });

  describe('Chained Ternary Operations', () => {
    it('should handle chained ternary operations', () => {
      expect(jmespath.search(data, 'foo ? bar ? baz : qux : quux')).toBe('baz');
    });
  });

  describe('Ternary Operations with Precedence', () => {
    it('should handle precedence with pipes', () => {
      expect(jmespath.search(data, 'false ? foo | bar | @ : baz')).toBe('baz');
    });

    it('should handle precedence with arithmetic', () => {
      expect(jmespath.search(data, 'foo ? fourty + two : `false`')).toBe(42);
    });
  });

  describe('Nested Ternary Operations', () => {
    it('should handle left-nested ternary operations', () => {
      expect(jmespath.search(data, 'true ? (true ? foo : bar) : baz')).toBe('foo');
      expect(jmespath.search(data, 'true ? (false ? foo : bar) : baz')).toBe('bar');
      expect(jmespath.search(data, 'false ? (true ? foo : bar) : baz')).toBe('baz');
    });

    it('should handle right-nested ternary operations', () => {
      expect(jmespath.search(data, 'true ? foo : (true ? bar : baz)')).toBe('foo');
      expect(jmespath.search(data, 'false ? foo : (true ? bar : baz)')).toBe('bar');
      expect(jmespath.search(data, 'false ? foo : (false ? bar : baz)')).toBe('baz');
    });

    it('should handle multiple nested ternary operations', () => {
      expect(jmespath.search(data, 'true ? (true ? (true ? foo : bar) : baz) : quux')).toBe('foo');
      expect(jmespath.search(data, 'true ? (true ? (false ? foo : bar) : baz) : quux')).toBe('bar');
      expect(jmespath.search(data, 'true ? (false ? (true ? foo : bar) : baz) : quux')).toBe('baz');
      expect(jmespath.search(data, 'false ? (true ? (true ? foo : bar) : baz) : quux')).toBe('quux');
    });

    it('should handle mixed nested ternary operations with literals', () => {
      expect(jmespath.search(data, 'true ? (`null` ? foo : bar) : baz')).toBe('bar');
      expect(jmespath.search(data, 'true ? (`[]` ? foo : bar) : baz')).toBe('bar');
      expect(jmespath.search(data, 'true ? (`{}` ? foo : bar) : baz')).toBe('bar');
      expect(jmespath.search(data, "true ? (''  ? foo : bar) : baz")).toBe('bar');
    });

    it('should handle nested ternary operations with arithmetic', () => {
      const testData = {
        ...data,
        threshold: 40,
      };
      expect(jmespath.search(testData, 'true ? (fourty + two > threshold ? foo : bar) : baz')).toBe('foo');
      expect(jmespath.search(testData, 'true ? (fourty + two < threshold ? foo : bar) : baz')).toBe('bar');
    });
  });
});
