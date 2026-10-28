import { describe, expect, it } from 'vitest';
import jmespath, { DEFAULT_MAX_DEPTH } from '../src';
import { expectError } from './error.utils';

describe('parsing', () => {
  it('should parse field node', () => {
    expect(jmespath.compile('foo')).toMatchObject({ type: 'Field', name: 'foo' });
  });
  it('should fail to parse invalid slice expressions', () => {
    expectError(() => {
      jmespath.compile('[:::]');
      return null;
    }, ['syntax', 'too many colons in slice expression']);
  });
  it.each([
    '[1 2:]',
    '[:1 3]',
    '[:0 3]',
    '[:-1 -2]',
    '[1:2 3:4]',
    '[::1 2]',
    '[::0 2]',
    '[::-1 -2]',
    '[1:4:2\t3]',
    '[1:2\n3]',
  ])('should reject repeated numbers in slice %s', slice => {
    expect(() => jmespath.compile(`foo${slice}`)).toThrow(/Syntax error/);
  });
  it('should reject repeated slice numbers when searching or validating', () => {
    const expression = 'foo[0:1 3]';
    expect(() => jmespath.search({ foo: [0, 1, 2, 3, 4] }, expression)).toThrow(/Syntax error/);
    expect(jmespath.validate(expression)).toMatchObject({
      valid: false,
      error: expect.stringMatching(/Syntax error/),
    });
  });
  it.each([
    ['[0:4:2]', [0, 2]],
    ['[:0]', []],
    ['[1:-1]', [1, 2, 3]],
    ['[::-1]', [4, 3, 2, 1, 0]],
    ['[4:0:-2]', [4, 2]],
    ['[ : 4 : 2 ]', [0, 2]],
    ['[:]', [0, 1, 2, 3, 4]],
    ['[::]', [0, 1, 2, 3, 4]],
  ])('should preserve valid slice %s', (slice, expected) => {
    const expression = `foo${slice}`;
    expect(jmespath.search({ foo: [0, 1, 2, 3, 4] }, expression)).toEqual(expected);
    expect(jmespath.validate(expression).valid).toBe(true);
  });
  it('should parse arithmetic addition', () => {
    expect(jmespath.compile('foo + bar')).toMatchObject({
      type: 'Arithmetic',
      operator: 'Plus',
      left: { type: 'Field', name: 'foo' },
      right: { type: 'Field', name: 'bar' },
    });
  });
  it('should parse arithmetic subtraction', () => {
    const expected = {
      type: 'Arithmetic',
      operator: 'Minus',
      left: { type: 'Field', name: 'foo' },
      right: { type: 'Field', name: 'bar' },
    };
    expect(jmespath.compile('foo - bar')).toMatchObject(expected);
    expect(jmespath.compile('foo − bar')).toMatchObject(expected);
  });
  it('should parse arithmetic unary negation', () => {
    const expected = {
      type: 'Unary',
      operator: 'Minus',
      operand: { type: 'Field', name: 'bar' },
    };
    expect(jmespath.compile('-bar')).toMatchObject(expected);
    expect(jmespath.compile('\u2212bar')).toMatchObject(expected);
  });
  it('should parse let expression', () => {
    const expected = {
      type: 'LetExpression',
      bindings: [
        {
          type: 'Binding',
          variable: 'foo',
          reference: { type: 'Field', name: 'bar' },
        },
        {
          type: 'Binding',
          variable: 'baz',
          reference: { type: 'Field', name: 'qux' },
        },
      ],
      expression: { type: 'Current' },
    };
    expect(jmespath.compile('let $foo = bar, $baz = qux in @')).toMatchObject(expected);
  });
  it('should fail to parse invalid let expression', () => {
    expectError(() => {
      jmespath.compile('let $foo = bar = qux');
      return null;
    }, 'syntax');
  });
  it('should parse paren expression', () => {
    // see #22 - issue with parenthesized expression-type
    const expected = {
      type: 'AndExpression',
      left: { type: 'Current' },
      right: { type: 'Literal' },
    };
    expect(jmespath.compile("  @ && 'truthy' ")).toMatchObject(expected);
    expect(jmespath.compile("( @ && 'truthy' )")).toMatchObject(expected);
  });
  describe('multi-select comma validation', () => {
    it('should parse valid multi-select list', () => {
      expect(jmespath.compile('[a, b, c]')).toMatchObject({
        type: 'MultiSelectList',
        children: [
          { type: 'Field', name: 'a' },
          { type: 'Field', name: 'b' },
          { type: 'Field', name: 'c' },
        ],
      });
      expect(jmespath.search({ a: 1, b: 2, c: 3 }, '[a, b, c]')).toEqual([1, 2, 3]);
    });
    it.each(['[a b]', '[a b c]', 'foo.[a b]', '[foo bar baz]', 'foo.[a, b c]'])(
      'should reject multi-select list without commas %s',
      expr => {
        expect(() => jmespath.compile(expr)).toThrow(/Syntax error/);
        expect(jmespath.validate(expr).valid).toBe(false);
      },
    );
    it.each(['[a, b,]', 'foo.[a, ]'])('should reject multi-select list with trailing comma %s', expr => {
      expect(() => jmespath.compile(expr)).toThrow(/Syntax error: unexpected token Rbracket/);
    });
    it('should parse valid multi-select hash', () => {
      expect(jmespath.compile('{a: b, c: d}')).toMatchObject({
        type: 'MultiSelectHash',
        children: [
          { type: 'KeyValuePair', name: 'a', value: { type: 'Field', name: 'b' } },
          { type: 'KeyValuePair', name: 'c', value: { type: 'Field', name: 'd' } },
        ],
      });
      expect(jmespath.search({ b: 1, d: 2 }, '{a: b, c: d}')).toEqual({ a: 1, c: 2 });
    });
    it.each(['{a: b c: d}', 'foo.{a: b c: d}'])('should reject multi-select hash without commas %s', expr => {
      expect(() => jmespath.compile(expr)).toThrow(/Syntax error/);
      expect(jmespath.validate(expr).valid).toBe(false);
    });
  });
  describe('parser recursion depth limit', () => {
    it('should enforce default recursion depth limit and fail gracefully', () => {
      const deepExpr = '('.repeat(DEFAULT_MAX_DEPTH + 1) + 'a' + ')'.repeat(DEFAULT_MAX_DEPTH + 1);
      expect(() => jmespath.compile(deepExpr)).toThrow(
        new RegExp(`Expression exceeds maximum allowed depth of ${DEFAULT_MAX_DEPTH}`),
      );
      expect(jmespath.validate(deepExpr)).toMatchObject({
        valid: false,
        error: expect.stringMatching(new RegExp(`Expression exceeds maximum allowed depth of ${DEFAULT_MAX_DEPTH}`)),
      });
    });
    it('should respect custom options.maxDepth', () => {
      const expr = '('.repeat(10) + 'a' + ')'.repeat(10);
      expect(() => jmespath.compile(expr, { maxDepth: 5 })).toThrow(/Expression exceeds maximum allowed depth of 5/);
      expect(jmespath.validate(expr, { maxDepth: 5 })).toMatchObject({
        valid: false,
        error: expect.stringContaining('depth of 5'),
      });
      expect(jmespath.compile(expr, { maxDepth: 20 })).toBeDefined();
    });
    it('should throw Error instead of unhandled RangeError on deeply nested expressions', () => {
      const deepExpr = '('.repeat(2000) + 'a' + ')'.repeat(2000);
      let thrownError: unknown;
      try {
        jmespath.compile(deepExpr);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError).not.toBeInstanceOf(RangeError);
    });
  });
});
