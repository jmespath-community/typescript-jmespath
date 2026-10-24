import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(jmespath.search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });

  it('preserves null elements in standalone slice expression', () => {
    expect(jmespath.search([1, null, 2], '[0:3]')).toEqual([1, null, 2]);
  });

  it('evaluates repeated queries correctly with expression cache', () => {
    expect(jmespath.search({ a: 1 }, 'a')).toEqual(1);
    expect(jmespath.search({ a: 2 }, 'a')).toEqual(2);
  });
});
