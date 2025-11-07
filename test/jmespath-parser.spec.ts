import { describe, expect, it } from 'vitest';
import jmespath from '../src';
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
});
