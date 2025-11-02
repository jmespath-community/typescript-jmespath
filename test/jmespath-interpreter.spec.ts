import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(jmespath.search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });
});
