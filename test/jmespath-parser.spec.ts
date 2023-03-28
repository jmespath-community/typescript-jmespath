import { compile } from '../src';
import { expectError } from './error.utils';

describe('parsing', () => {
  it('should parse field node', () => {
    expect(compile('foo')).toMatchObject({ type: 'Field', name: 'foo' });
  });
  it('should fail to parse invalid slice expressions', () => {
    expectError(() => {
      compile('[:::]');
      return null;
    }, ['syntax', 'too many colons in slice expression']);
  });
  it('should parse arithmetic addition', () => {
    expect(compile('foo + bar')).toMatchObject({
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
    expect(compile('foo - bar')).toMatchObject(expected);
    expect(compile('foo − bar')).toMatchObject(expected);
  });
  it('should parse arithmetic unary negation', () => {
    const expected = {
      type: 'Unary',
      operator: 'Minus',
      operand: { type: 'Field', name: 'bar' },
    };
    expect(compile('-bar')).toMatchObject(expected);
    expect(compile('\u2212bar')).toMatchObject(expected);
  });
  it('should parse let expression', () => {
    const expected = {
      type: 'LetExpression',
      bindings: [
        { type: 'Binding', variable: 'foo', reference: { type: 'Field', name: 'bar' } },
        { type: 'Binding', variable: 'baz', reference: { type: 'Field', name: 'qux' } },
      ],
      expression: { type: 'Current' },
    };
    expect(compile('let $foo = bar, $baz = qux in @')).toMatchObject(expected);
  });
  it('should fail to parse invalid let expression', () => {
    expectError(() => {
      compile('let $foo = bar = qux');
      return null;
    }, 'syntax');
  });
});
